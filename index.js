const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode-terminal');

// Your webhook URL
const WEBHOOK_URL = 'https://bass-caring-cheetah.ngrok-free.app/receive-message';

// Configuration
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const MESSAGE_THRESHOLD_MINUTES = 5; // Check messages within last 5 minutes

class WhatsAppWebhookClient {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './whatsapp-session'
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.lastProcessedTimestamp = 0;
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on('qr', (qr) => {
            console.log('QR Code Generated. Scan with WhatsApp:');
            qrcode.generate(qr, { small: true }, function (qrcode) {
                console.log(qrcode);
            });
        });

        this.client.on('ready', () => {
            console.log('WhatsApp Client is ready!');
            console.log('Your WhatsApp ID:', this.client.info.wid.user);
            this.startPeriodicCheck();
        });

        this.client.on('authenticated', () => {
            console.log('Authentication successful');
        });

        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failed:', msg);
        });
    }

    startPeriodicCheck() {
        setInterval(async () => {
            try {
                await this.checkRecentSelfMessages();
            } catch (error) {
                console.error('Error in periodic check:', error);
            }
        }, CHECK_INTERVAL);
    }

    async checkRecentSelfMessages() {
        try {
            // Get your own number
            const yourNumber = this.client.info.wid.user;
            const selfId = `${yourNumber}@c.us`;

            // Fetch recent chats
            const chats = await this.client.getChats();

            // Find your chat with yourself
            const selfChat = chats.find(chat => chat.id.user === yourNumber);

            if (!selfChat) {
                console.log('No self chat found');
                return;
            }

            // Fetch recent messages
            const messages = await selfChat.fetchMessages({
                limit: 5 // Fetch last 5 messages
            });

            // Filter for recent messages
            const currentTime = Date.now() / 1000;
            const recentMessages = messages.filter(msg =>
                msg.from === selfId &&
                (currentTime - msg.timestamp) <= (MESSAGE_THRESHOLD_MINUTES * 60) &&
                msg.timestamp > this.lastProcessedTimestamp
            );

            // Process recent messages
            for (const msg of recentMessages) {
                console.log('Processing recent self message:', {
                    body: msg.body,
                    timestamp: msg.timestamp
                });

                try {
                    await axios.post(WEBHOOK_URL, {
                        message: msg.body,
                        timestamp: msg.timestamp,
                        type: msg.type
                    });

                    // Update last processed timestamp
                    this.lastProcessedTimestamp = Math.max(
                        this.lastProcessedTimestamp,
                        msg.timestamp
                    );

                    console.log('Webhook sent successfully');
                } catch (webhookError) {
                    console.error('Webhook error:', webhookError.message);
                }
            }
        } catch (error) {
            console.error('Error checking recent messages:', error);
        }
    }

    initialize() {
        this.client.initialize();
    }
}

// Create and initialize the client
const webhookClient = new WhatsAppWebhookClient();
webhookClient.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await webhookClient.client.destroy();
    process.exit(0);
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});