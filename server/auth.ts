import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import MemoryStore from "memorystore";
import { createLog, LogType } from "./logger";

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
  const MemStore = MemoryStore(session);
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "lyrecloud-secret-key",
    resave: false,
    saveUninitialized: false,
    store: new MemStore({
      checkPeriod: 86400000 // Prune expired entries every 24h
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Incorrect username" });
        }
        
        if (!(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Incorrect password" });
        }
        
        if (user.status !== "approved") {
          return done(null, false, { message: "Your account is pending approval" });
        }
        
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(new Error("User not found"));
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Authentication routes
  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      console.log("Registration request received:", req.body.username);
      const { username, password } = req.body;
      
      if (!username || !password) {
        console.log("Registration failed: Missing username or password");
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      // Protect the permanent admin account
      if (username.toLowerCase() === 'rdxhere.exe') {
        console.log("Registration attempt with reserved username 'rdxhere.exe'");
        return res.status(403).json({ message: "This username is reserved" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        console.log(`Registration failed: Username ${username} already exists`);
        return res.status(400).json({ message: "Username already exists" });
      }
      
      console.log(`Creating new user: ${username} with role 'user' and status 'pending'`);
      
      try {
        // Hash password and create user
        const hashedPassword = await hashPassword(password);
        const newUser = await storage.createUser({
          username,
          password: hashedPassword,
          role: "user",
          status: "pending",
          isApproved: false
        });
        
        // Don't include password in response
        const { password: _, ...userWithoutPassword } = newUser;
        
        console.log(`User ${username} registered successfully with ID ${newUser.id}`);
        
        // Log the registration event
        await createLog(
          LogType.USER_REGISTER,
          `New user registered: ${username}`,
          "system",
          { userId: newUser.id, username: newUser.username, status: "pending" }
        );
        
        res.status(201).json({ 
          message: "Registration successful. Your account is pending admin approval." 
        });
      } catch (createError: any) {
        console.error(`Failed to create user ${username}:`, createError);
        res.status(500).json({ message: `User creation failed: ${createError.message || 'Unknown error'}` });
      }
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: `Error creating user: ${error.message || 'Unknown error'}` });
    }
  });

  app.post("/api/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", async (err: Error, user: SelectUser, info: { message: string }) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        // Log failed login attempt
        await createLog(
          LogType.USER_LOGIN,
          `Failed login attempt for user: ${req.body.username}`,
          "system",
          { username: req.body.username, reason: info.message || "Authentication failed" }
        );
        return res.status(401).json({ message: info.message || "Authentication failed" });
      }
      req.login(user, async (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }
        
        // Log successful login
        await createLog(
          LogType.USER_LOGIN,
          `User logged in: ${user.username}`,
          user.username,
          { userId: user.id, role: user.role }
        );
        
        const { password, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", async (req: Request, res: Response) => {
    // Get the username before logging out
    const username = req.user ? (req.user as SelectUser).username : "unknown";
    const userId = req.user ? (req.user as SelectUser).id : 0;
    
    req.logout(async (err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      
      // Log the logout event
      await createLog(
        LogType.USER_LOGOUT,
        `User logged out: ${username}`,
        username,
        { userId: userId }
      );
      
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, ...userWithoutPassword } = req.user as SelectUser;
    res.json(userWithoutPassword);
  });

  // User management routes
  app.get("/api/users", isAdmin, async (_req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithoutPasswords = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      res.json(usersWithoutPasswords);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  app.get("/api/users/pending", isAdmin, async (_req: Request, res: Response) => {
    try {
      const pendingUsers = await storage.getPendingUsers();
      const usersWithoutPasswords = pendingUsers.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      res.json(usersWithoutPasswords);
    } catch (error) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Error fetching pending users" });
    }
  });

  app.post("/api/users/approve/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        status: "approved",
        isApproved: true
      });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user" });
      }
      
      // Log user approval
      await createLog(
        LogType.USER_APPROVE,
        `User approved: ${user.username}`,
        (req.user as SelectUser).username,
        { userId: user.id, username: user.username, approvedBy: (req.user as SelectUser).username }
      );
      
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Error approving user" });
    }
  });

  app.post("/api/users/reject/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        status: "rejected",
        isApproved: false
      });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user" });
      }
      
      // Log user rejection
      await createLog(
        LogType.USER_REJECT,
        `User rejected: ${user.username}`,
        (req.user as SelectUser).username,
        { userId: user.id, username: user.username, rejectedBy: (req.user as SelectUser).username }
      );
      
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error rejecting user:", error);
      res.status(500).json({ message: "Error rejecting user" });
    }
  });

  app.post("/api/users/make-admin/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        role: "admin"
      });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user" });
      }
      
      // Log making a user admin
      await createLog(
        LogType.USER_ADMIN,
        `User ${user.username} was given admin rights`,
        (req.user as SelectUser).username,
        { userId: user.id, username: user.username, grantedBy: (req.user as SelectUser).username }
      );
      
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error making user admin:", error);
      res.status(500).json({ message: "Error making user admin" });
    }
  });

  app.post("/api/users/remove-admin/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if it's the permanent admin account (rdxhere.exe)
      if (user.username === "rdxhere.exe") {
        return res.status(403).json({ message: "Cannot remove admin role from the permanent administrator" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        role: "user"
      });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user" });
      }
      
      // Log removing admin rights
      await createLog(
        LogType.USER_ADMIN_REMOVE,
        `Admin rights removed from user: ${user.username}`,
        (req.user as SelectUser).username,
        { userId: user.id, username: user.username, removedBy: (req.user as SelectUser).username }
      );
      
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error removing admin role:", error);
      res.status(500).json({ message: "Error removing admin role" });
    }
  });

  app.delete("/api/users/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if it's the permanent admin account (rdxhere.exe)
      if (user.username === "rdxhere.exe") {
        return res.status(403).json({ message: "Cannot delete the permanent administrator account" });
      }
      
      const success = await storage.deleteUser(userId);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to delete user" });
      }
      
      // Log user deletion
      await createLog(
        LogType.USER_DELETE,
        `User deleted: ${user.username}`,
        (req.user as SelectUser).username,
        { userId: user.id, username: user.username, deletedBy: (req.user as SelectUser).username }
      );
      
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Error deleting user" });
    }
  });

  // Middleware to check if user is admin
  function isAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const user = req.user as SelectUser;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    
    next();
  }

  // Set up default admin user if it doesn't exist
  setupDefaultAdmin();
}

async function setupDefaultAdmin() {
  try {
    const adminUsername = "rdxhere.exe";
    const adminPassword = "rdxpass";
    
    const existingAdmin = await storage.getUserByUsername(adminUsername);
    if (!existingAdmin) {
      // Create the admin user if it doesn't exist
      const hashedPassword = await hashPassword(adminPassword);
      await storage.createUser({
        username: adminUsername,
        password: hashedPassword,
        role: "admin",
        status: "approved",
        isApproved: true
      });
      console.log("Created default admin user:", adminUsername);
    } else {
      // Check if the password is already hashed
      const passwordIsHashed = existingAdmin.password.includes('.');
      
      // Check if there's a role typo (like "adminn" instead of "admin")
      const roleNeedsUpdate = existingAdmin.role !== "admin";
      
      let updates: Partial<SelectUser> = {
        role: "admin", // Always ensure the role is exactly "admin"
        status: "approved",
        isApproved: true
      };
      
      // If password isn't hashed yet, hash it now
      if (!passwordIsHashed) {
        updates.password = await hashPassword(adminPassword);
        console.log("Updating admin password with hashed version");
      }
      
      if (roleNeedsUpdate) {
        console.log(`Fixing admin role from "${existingAdmin.role}" to "admin"`);
      }
      
      // Ensure the user has admin role and proper password
      await storage.updateUser(existingAdmin.id, updates);
      console.log("Ensured admin privileges and proper security for", adminUsername);
    }
  } catch (error) {
    console.error("Error setting up default admin:", error);
  }
}