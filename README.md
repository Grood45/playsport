# Real-Time SSE Odds API Server 🚀

Yep aapki standalone, 100% real-time **Server-Sent Events (SSE)** API hai jo bina kisi latency ke Firebase se data proxy karke sidha connect hone waley clients ko bhejti hai. 

**Local par run karne ka tarika:**
```bash
npm install
npm start
```

## ☁️ AWS par API Deploy Kaise Karein (Step-by-Step Guide)

Agar aap apni iss API ko ek live server pe 24/7 chalana chahte hain continuously, toh **AWS (Amazon Web Services) EC2** sabse best hai. Ise set up karne ke steps niche padhein:

### Step 1: Naya Server (EC2) Banayein
1. Apne AWS Console mein login karein aur **EC2** service kholein.
2. "Launch Instance" par click karein.
3. OS: **Ubuntu 24.04 LTS** select karein.
4. Instance Type: `t2.micro` (Free tier me aata hai) ya usse upar ka koi VPS choose karein agar clients zyada hon.
5. Key Pair create karke download karein (`.pem` file), ye SSH connection ke kaam aati hai.
6. **Network/Security Groups:** 
   - HTTP (80) & HTTPS (443) allow karein.
   - Custom TCP rule me Port `3001` allow karein (Taaki pehli dafa direct port se test ho sake).
7. "Launch" par click karein.

### Step 2: Server me SSH se Connect karein
Apne computer (Mac/Terminal) par server ko connect karein:
```bash
# Apni download ki hui key ka access theek karein (sirf pehli baar)
chmod 400 aapki-key.pem

# Ubuntu me login karein 
ssh -i "aapki-key.pem" ubuntu@aapki_ec2_public_IP
```

### Step 3: Node.js aur Git Install Karein
Server me ghusne ke baad Node install karein:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs npm git
```

### Step 4: Apne Code ko Server par Daalein
Aap iss project ko GitHub pe push karke server se waha pull le sakte hain (Best practice), ya phir direct ZIP bhej sakte hain.
```bash
git clone https://github.com/aapka-username/aapka-repo.git
cd playsport
npm install
```

### Step 5: PM2 Install karein (API ko hamesha zinda rakhne ke liye)
PM2 ek process manager hai jo ye dhyan rakhega ki aapki API 24/7 chalti rahe aur agar server restart ho toh apne aap on ho jaye.
```bash
sudo npm install -g pm2
pm2 start server.js --name "kingexchange-odds-api"
pm2 save
pm2 startup
```
🚀 *Aur bas! Aapki API AWS par Deploy ho gayi hai.*
Aap usay aapki Public IP se HTTP ke zariye Check Kar sakte hain:
`http://aapki_ec2_public_IP:3001/api/stream/odds?eventId=123&sportId=4`

---

### Step 6: Domain Lagana (Optional lekin Zaroori)
1. Kisi domain provider (jaise GoDaddy) se apne server IP par A Record set karein (jaise `api.playsport.com`).
2. Server me NGINX install karein taaki hum port 3001 ko web port 80/443 se link kar sakein.
```bash
sudo apt install nginx -y
```
3. Nginx file me code likhkar usay `proxy_pass http://localhost:3001` kar dein.
4. SSL lagane ke liye Let's Encrypt (Certbot) run karein, jis se aapki website **HTTPS** ho jayegi.

*Ab aapka Client (Jisko aap API bech rahe hain) kisi bhi browser se aapse Real-Time SSE stream asani se secure HTTPS tareeke se le payega!*
