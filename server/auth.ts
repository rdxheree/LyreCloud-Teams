import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./enhanced-storage";
import { User as SelectUser } from "@shared/schema";
import { create } from "domain";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const PostgresSessionStore = connectPg(session);
  
  // Choose session store based on environment
  let sessionStore;
  if (process.env.DATABASE_URL) {
    sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  } else {
    sessionStore = new MemoryStore({
      checkPeriod: 86400000, // Prune expired entries every 24h
    });
  }
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'lyrecloud_secret_key',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Load initial users from NextCloud if needed
  setupDefaultAdmin();
  
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        
        // Only allow approved users to login
        if (!user.isApproved) {
          return done(null, false);
        }
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || undefined);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Check if a user with the requested username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create the registration request with pending status
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        isApproved: false,
        status: 'pending',
        role: 'user',
      });

      return res.status(201).json({ 
        message: "Registration request submitted, waiting for admin approval" 
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        return res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });
  
  // API endpoints for user management (admin only)
  app.get("/api/admin/users", isAdmin, async (req, res, next) => {
    try {
      const users = await storage.getAllUsers();
      // Don't send the password hash to the client
      const usersWithoutPassword = users.map(({ password, ...user }) => user);
      res.json(usersWithoutPassword);
    } catch (error) {
      next(error);
    }
  });
  
  app.get("/api/admin/pending-users", isAdmin, async (req, res, next) => {
    try {
      const users = await storage.getPendingUsers();
      // Don't send the password hash to the client
      const usersWithoutPassword = users.map(({ password, ...user }) => user);
      res.json(usersWithoutPassword);
    } catch (error) {
      next(error);
    }
  });
  
  app.post("/api/admin/approve-user/:id", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        isApproved: true,
        status: 'approved'
      });
      
      // Don't send the password hash to the client
      const { password, ...userWithoutPassword } = updatedUser || {};
      res.json(userWithoutPassword);
    } catch (error) {
      next(error);
    }
  });
  
  app.post("/api/admin/reject-user/:id", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        isApproved: false,
        status: 'rejected'
      });
      
      // Don't send the password hash to the client
      const { password, ...userWithoutPassword } = updatedUser || {};
      res.json(userWithoutPassword);
    } catch (error) {
      next(error);
    }
  });
  
  app.post("/api/admin/make-admin/:id", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        role: 'admin'
      });
      
      // Don't send the password hash to the client
      const { password, ...userWithoutPassword } = updatedUser || {};
      res.json(userWithoutPassword);
    } catch (error) {
      next(error);
    }
  });
  
  app.post("/api/admin/remove-admin/:id", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent removing the last admin
      const allUsers = await storage.getAllUsers();
      const adminUsers = allUsers.filter(u => u.role === 'admin');
      if (adminUsers.length <= 1 && user.role === 'admin') {
        return res.status(400).json({ 
          message: "Cannot remove the last admin user" 
        });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        role: 'user'
      });
      
      // Don't send the password hash to the client
      const { password, ...userWithoutPassword } = updatedUser || {};
      res.json(userWithoutPassword);
    } catch (error) {
      next(error);
    }
  });
  
  app.delete("/api/admin/delete-user/:id", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent deleting the last admin
      const allUsers = await storage.getAllUsers();
      const adminUsers = allUsers.filter(u => u.role === 'admin');
      if (adminUsers.length <= 1 && user.role === 'admin') {
        return res.status(400).json({ 
          message: "Cannot delete the last admin user" 
        });
      }
      
      // Check if the user is trying to delete themselves
      if (req.user && req.user.id === userId) {
        return res.status(400).json({ 
          message: "Cannot delete your own account" 
        });
      }
      
      const success = await storage.deleteUser(userId);
      if (!success) {
        return res.status(500).json({ message: "Failed to delete user" });
      }
      
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      next(error);
    }
  });
}

// Middleware to check if the user is an admin
function isAdmin(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  
  return res.status(403).json({ message: "Access denied" });
}

// Function to ensure there's at least one admin user in the system
async function setupDefaultAdmin() {
  try {
    const users = await storage.getAllUsers();
    const adminUsers = users.filter(user => user.role === 'admin');
    
    if (adminUsers.length === 0) {
      // Create the default admin user if none exists
      const hashedPassword = await hashPassword('rdxpass');
      await storage.createUser({
        username: 'rdxhere.exe',
        password: hashedPassword,
        role: 'admin',
        isApproved: true,
        status: 'approved'
      });
      console.log('Created default admin user: rdxhere.exe');
    }
  } catch (error) {
    console.error('Error setting up default admin:', error);
  }
}