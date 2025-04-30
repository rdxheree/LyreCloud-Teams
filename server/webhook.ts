import axios from 'axios';
import { LogEntry } from './logger';
import { NextCloudStorage } from './nextcloud-storage';

export interface WebhookConfig {
  url: string;
  enabled: boolean;
  lastTestedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
}

export class WebhookService {
  private static instance: WebhookService;
  private config: WebhookConfig | null = null;
  private storage: NextCloudStorage;

  private constructor(storage: NextCloudStorage) {
    this.storage = storage;
  }

  public static getInstance(storage: NextCloudStorage): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService(storage);
    }
    return WebhookService.instance;
  }

  /**
   * Initialize the webhook service by loading configuration from NextCloud
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadConfig();
      console.log('Webhook service initialized', this.config ? `URL: ${this.config.url}, Enabled: ${this.config.enabled}` : 'No webhook configured');
    } catch (error) {
      console.error('Failed to initialize webhook service:', error);
      this.config = null;
    }
  }

  /**
   * Load webhook configuration from NextCloud
   */
  private async loadConfig(): Promise<void> {
    try {
      if (!this.storage.client) {
        throw new Error('NextCloud client not available');
      }

      const exists = await this.storage.client.exists('LyreTeams/webhook.json');
      if (!exists) {
        console.log('No webhook.json found in NextCloud, initializing with default config');
        this.config = {
          url: '',
          enabled: false
        };
        return;
      }

      // Read the webhook.json file
      const content = await this.storage.client.getFileContents('LyreTeams/webhook.json', { format: 'text' });
      if (!content) {
        throw new Error('Failed to read webhook.json');
      }

      // Parse the content
      this.config = JSON.parse(content as string) as WebhookConfig;
      console.log('Loaded webhook configuration from NextCloud');
    } catch (error) {
      console.error('Error loading webhook configuration:', error);
      // Initialize with default config
      this.config = {
        url: '',
        enabled: false
      };
    }
  }

  /**
   * Save webhook configuration to NextCloud
   */
  private async saveConfig(): Promise<void> {
    try {
      if (!this.storage.client) {
        throw new Error('NextCloud client not available');
      }

      // Save the config to webhook.json
      await this.storage.client.putFileContents(
        'LyreTeams/webhook.json',
        JSON.stringify(this.config, null, 2)
      );
      console.log('Saved webhook configuration to NextCloud');
    } catch (error) {
      console.error('Error saving webhook configuration:', error);
      throw error;
    }
  }

  /**
   * Update webhook configuration
   */
  public async updateConfig(config: Partial<WebhookConfig>): Promise<WebhookConfig> {
    if (!this.config) {
      this.config = {
        url: '',
        enabled: false,
        ...config
      };
    } else {
      this.config = {
        ...this.config,
        ...config
      };
    }

    await this.saveConfig();
    return this.config;
  }

  /**
   * Get the current webhook configuration
   */
  public getConfig(): WebhookConfig | null {
    return this.config;
  }

  /**
   * Test the webhook connection by sending a test message
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config || !this.config.url) {
      return { success: false, message: 'No webhook URL configured' };
    }

    try {
      const payload = {
        embeds: [{
          title: 'Webhook Test',
          description: 'Connection established with LyreCloud Teams Portal',
          color: 0x00ff00,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'LyreCloud Teams'
          }
        }]
      };

      await axios.post(this.config.url, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Update last tested timestamp
      this.config.lastTestedAt = new Date().toISOString();
      this.config.lastSuccessAt = new Date().toISOString();
      delete this.config.lastFailureAt;
      delete this.config.lastFailureReason;
      await this.saveConfig();

      return { success: true, message: 'Connection test successful' };
    } catch (error: any) {
      console.error('Webhook test failed:', error);
      
      // Update failure information
      this.config.lastTestedAt = new Date().toISOString();
      this.config.lastFailureAt = new Date().toISOString();
      this.config.lastFailureReason = error.message || 'Unknown error';
      await this.saveConfig();
      
      return { 
        success: false, 
        message: `Webhook test failed: ${error.message || 'Unknown error'}` 
      };
    }
  }

  /**
   * Send a log entry to the webhook
   */
  public async sendLog(log: LogEntry): Promise<boolean> {
    if (!this.config || !this.config.url || !this.config.enabled) {
      return false;
    }

    try {
      // Convert log to Discord embed format
      const logEmbed = this.createLogEmbed(log);
      
      await axios.post(this.config.url, {
        embeds: [logEmbed]
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return true;
    } catch (error: any) {
      console.error('Failed to send log to webhook:', error);
      return false;
    }
  }

  /**
   * Convert a log entry to a Discord embed format
   */
  private createLogEmbed(log: LogEntry): any {
    // Determine color based on log type
    let color: number;
    switch (log.type) {
      // User-related logs
      case 'USER_REGISTER':
      case 'USER_LOGIN':
      case 'USER_LOGOUT':
        color = 0x3498db; // Blue
        break;
      
      // Admin actions
      case 'USER_ADMIN':
      case 'USER_ADMIN_REMOVE':
      case 'USER_APPROVE':
        color = 0x9b59b6; // Purple
        break;
      
      // File operations
      case 'FILE_UPLOAD':
      case 'FILE_RENAME':
        color = 0x2ecc71; // Green
        break;
      
      // Destructive operations
      case 'USER_DELETE':
      case 'USER_REJECT':
      case 'FILE_DELETE':
        color = 0xe74c3c; // Red
        break;
      
      // System logs
      case 'SYSTEM':
        color = 0xf39c12; // Yellow
        break;
      
      default:
        color = 0x95a5a6; // Gray
    }
    
    // Format details if present
    type DiscordField = {
      name: string;
      value: string;
      inline: boolean;
    };
    
    const fields: DiscordField[] = [];
    if (log.details) {
      Object.entries(log.details).forEach(([key, value]) => {
        fields.push({
          name: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          inline: true
        });
      });
    }
    
    // Format timestamp
    const timestamp = new Date(log.timestamp).toISOString();
    
    return {
      title: `${log.type.replace(/_/g, ' ')}`,
      description: log.message,
      color: color,
      timestamp: timestamp,
      fields: fields.length > 0 ? fields : undefined,
      footer: {
        text: `User: ${log.username}`
      }
    };
  }
}