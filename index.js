const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, BufferJSON } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const readline = require('readline');

const app = express();
app.use(express.json());

let waSock = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    waSock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false // QR කෝඩ් එක ඔෆ් කරලා තියෙන්නේ
    });

    // Pairing Code එක ලබා ගැනීම
    if (!waSock.authState.creds.registered) {
        const phoneNumber = await question('Please enter your WhatsApp phone number (with country code, e.g., 947xxxxxxxx): ');
        const code = await waSock.requestPairingCode(phoneNumber.trim());
        console.log(`\n========================================`);
        console.log(`YOUR PAIRING CODE IS: ${code}`);
        console.log(`========================================\n`);
    }

    waSock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Bot connected successfully using Pairing Code!');
            
            waSock.groupFetchAllParticipating().then((groups) => {
                console.log('--- Your WhatsApp Groups and JIDs ---');
                for (let groupId in groups) {
                    console.log(`Group Name: ${groups[groupId].subject} --> JID: ${groupId}`);
                }
                console.log('---------------------------------------');
            }).catch((error) => {
                console.log('Error fetching groups:', error);
            });
        }
    });

    waSock.ev.on('creds.update', saveCreds);
}

// API endpoint to receive orders from the website
app.post('/api/send-order', async (req, res) => {
    try {
        const orderData = req.body;
        
        let message = `*New Order Received!*%0A%0A` +
                      `📦 *Product:* ${orderData.productName}%0A` +
                      `🔢 *Quantity:* ${orderData.quantity}%0A` +
                      `💰 *Total Price:* ${orderData.totalPrice}%0A` +
                      `👤 *Name:* ${orderData.customerName}%0A` +
                      `📞 *Phone:* ${orderData.customerPhone}%0A` +
                      `📍 *Address:* ${orderData.customerAddress}%0A` +
                      `📝 *Note:* ${orderData.customerNote || 'None'}`;

        const TARGET_GROUP_JID = orderData.groupId || "YOUR_GROUP_JID_HERE";

        if (waSock) {
            await waSock.sendMessage(TARGET_GROUP_JID, { text: decodeURIComponent(message) });
            return res.status(200).json({ success: true, message: "Order sent to WhatsApp group!" });
        } else {
            return res.status(500).json({ success: false, message: "WhatsApp bot not connected yet." });
        }
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startBot();
});
