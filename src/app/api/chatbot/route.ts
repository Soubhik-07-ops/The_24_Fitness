import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateAdminSession } from '@/lib/adminAuth';
import { validateTrainerSession } from '@/lib/trainerAuth';

// Content safety: Inappropriate words/phrases to detect
const INAPPROPRIATE_PATTERNS = [
    // Abusive language
    /\b(fuck|shit|damn|bitch|asshole|bastard|piss|hell)\b/gi,
    // Sexual content
    /\b(sex|sexual|porn|nude|naked|erotic|orgasm|masturbat)\w*/gi,
    // Hate speech indicators
    /\b(kill|die|hate|stupid|idiot|moron|retard)\b/gi,
    // Vulgar slang
    /\b(crap|pissed|screw|suck)\b/gi,
];

// Check if message contains inappropriate content
function containsInappropriateContent(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return INAPPROPRIATE_PATTERNS.some(pattern => pattern.test(lowerMessage));
}

// Check if user is admin or trainer
async function isAdminOrTrainer(): Promise<boolean> {
    try {
        const cookieStore = await cookies();

        // Check admin session
        const adminToken = cookieStore.get('admin_token')?.value;
        if (adminToken) {
            const admin = await validateAdminSession(adminToken);
            if (admin) return true;
        }

        // Check trainer session
        const trainerToken = cookieStore.get('trainer_token')?.value;
        if (trainerToken) {
            const trainer = await validateTrainerSession(trainerToken);
            if (trainer) return true;
        }

        return false;
    } catch {
        return false;
    }
}

// Knowledge base for responses - Updated for production system
const KNOWLEDGE_BASE = {
    greeting: [
        "Hello! I'm The24FitBot, your virtual assistant 💪 How can I help you today?",
        "Hi there! Welcome to 24 Fitness Gym. I'm here to help you with memberships, plans, and more!",
        "Hey! 👋 I'm The24FitBot. What can I help you with today?"
    ],
    membership: {
        join: "To join our gym:\n1. Sign up or log in (/signup)\n2. Go to Membership page (/membership)\n3. Choose a plan (Basic, Premium, Elite, or Regular Monthly)\n4. Fill membership form with your details\n5. Complete payment via QR code\n6. Upload payment screenshot and transaction ID\n7. Wait for admin approval (24-48 hours)\n\nOnce approved, your membership activates! 💪",
        purchase: "Membership purchase process:\n1. Go to Membership page (/membership)\n2. Select your plan:\n   - Basic/Premium/Elite (3, 6, or 12 months)\n   - Regular Monthly (Boys ₹1,200 first payment, Girls ₹1,400)\n3. Fill membership form (/membership/form)\n4. Select addons (In-Gym access, Trainer) if needed\n5. Go to payment page - scan QR code\n6. Upload payment screenshot + transaction ID\n7. Wait for admin approval (24-48 hours)\n\nYour membership activates after admin verifies payment!",
        plans: "We offer four membership plans:\n\n💪 Basic Plan - Online mode\n   • Boys: ₹2,200 (3 months)\n   • Girls: ₹2,400 (3 months)\n   • Workout charts included\n   • Trainer available as addon\n\n⭐ Premium Plan - Online mode\n   • Boys: ₹4,000 (6 months)\n   • Girls: ₹4,400 (6 months)\n   • 1 week FREE trainer access\n   • Workout + Diet charts\n\n🏆 Elite Plan - Online mode\n   • Boys: ₹6,800 (12 months)\n   • Girls: ₹7,800 (12 months)\n   • 1 month FREE trainer access\n   • Workout + Diet charts\n\n🏋️ Regular Monthly - In-Gym access\n   • Boys: ₹1,200 first payment, ₹650/month after\n   • Girls: ₹1,400 first payment, ₹700/month after\n   • 24/6 gym access\n   • Monthly renewal\n\nVisit /membership for detailed pricing!",
        pending: "If your payment is pending, it's waiting for admin verification. This is normal! Our team manually verifies each payment for security.\n\n⏱️ Approval usually takes 24-48 hours\n📧 You'll receive a notification when approved\n📊 Check your Dashboard for status updates\n\nIf it's been more than 48 hours, contact support via /contact page.",
        expired: "If your membership has expired:\n\n1️⃣ Check if you're in grace period (15 days after expiry)\n   • If yes → Renew from Dashboard\n   • If no → Grace period ended, contact support\n\n2️⃣ To renew:\n   • Go to Dashboard (/dashboard)\n   • Click 'Renew Membership' button\n   • Complete payment process\n   • Wait for admin approval\n\n⚠️ Regular Monthly plans: If expired, trainer access is immediately revoked. Renew membership to regain access.",
        renewal: "Membership renewal process:\n\n1️⃣ Check eligibility:\n   • Your membership must be in grace period (15 days after expiry)\n   • Status should show 'Grace Period' in Dashboard\n\n2️⃣ Renew steps:\n   • Go to Dashboard (/dashboard)\n   • Click 'Renew Membership' button\n   • Select plan and addons (if needed)\n   • Complete payment\n   • Wait for admin approval (24-48 hours)\n\n3️⃣ After approval:\n   • Regular Monthly: Duration resets to 1 month from approval date\n   • Other plans: Duration extends from current end date\n   • Invoice generated automatically\n\n⏰ Renew within grace period (15 days) to avoid losing membership!",
        myPlans: "View all your memberships at:\n/membership/my-plans\n\nHere you can see:\n- All membership history\n- Current and past memberships\n- Membership status (Active, Grace Period, Expired)\n- Renewal eligibility\n- Payment history\n- Invoice downloads",
        status: "Membership status types:\n\n✅ Active - Membership is active and running\n   • Full access to all features\n   • Trainer access (if assigned)\n   • Weekly charts available\n\n⏳ Pending - Waiting for admin approval\n   • Payment submitted, under review\n   • Usually approved within 24-48 hours\n\n⏰ Grace Period - Membership expired, renewal window open\n   • 15 days to renew\n   • Can still access some features\n   • Renew from Dashboard\n\n❌ Expired - Membership ended, grace period passed\n   • Contact support for assistance\n   • May need to create new membership\n\n🚫 Rejected - Payment was rejected\n   • Check reason in Dashboard\n   • Contact support via /contact\n   • Resubmit payment if needed",
        gracePeriod: "Grace Period explained:\n\n📅 Membership Grace Period (15 days):\n   • Starts when membership end date passes\n   • You have 15 days to renew\n   • Status changes to 'Grace Period'\n   • Renew from Dashboard during this time\n   • After 15 days, membership expires permanently\n\n📅 Trainer Grace Period (5 days):\n   • Starts when trainer access expires\n   • You have 5 days to renew trainer access\n   • Can't message trainer during grace period\n   • Renew trainer separately from membership\n\n⚠️ Regular Monthly plans: If membership expires, trainer access is immediately revoked (no grace period for trainer).",
        regularMonthly: "Regular Monthly Plan details:\n\n💰 Pricing:\n   • Boys: ₹1,200 first payment (includes admission + 1 month)\n   • Girls: ₹1,400 first payment (includes admission + 1 month)\n   • From 2nd month: ₹650/month (boys) or ₹700/month (girls)\n\n🏋️ Features:\n   • 24/6 gym access\n   • All equipment access\n   • Locker facility\n   • Monthly renewal (no long-term commitment)\n\n⚠️ Important rules:\n   • Duration resets to 1 month on each renewal\n   • If membership expires, trainer access is immediately revoked\n   • Trainer addon available (matches membership duration)\n   • Trainer access cannot exceed membership end date",
    },
    payment: {
        qr: "Payment is done via QR code only. Here's how:\n1. Complete membership form\n2. Go to payment page (/membership/payment)\n3. Scan or view the QR code displayed\n4. Complete payment through your payment app (UPI, Paytm, etc.)\n5. Upload payment screenshot\n6. Enter transaction ID\n7. Submit for verification\n\n⏱️ Payment verification takes 24-48 hours\n📧 You'll receive a notification when verified\n📊 Check Dashboard for payment status",
        verification: "Payment verification process:\n\n⏱️ Timeline: 24-48 hours (usually within 24 hours)\n\n✅ What happens:\n1. Admin manually verifies your payment\n2. Checks screenshot and transaction ID\n3. Approves membership\n4. Invoice generated automatically\n5. You receive notification\n\n📊 Check status:\n• Dashboard → Payment status\n• Status: Pending → Verified\n• Once verified, membership activates\n\nIf it's been more than 48 hours, contact support via /contact.",
        refund: "For refunds, payment disputes, or payment-related issues:\n\n📞 Contact support:\n• Go to Contact page (/contact)\n• Submit your request\n• Admin will review and respond\n\n⚠️ I cannot process refunds directly. All refund requests must go through admin support for security and verification.",
        screenshot: "To upload payment screenshot:\n1. After making payment via QR code, take a screenshot\n2. Go to payment page (/membership/payment)\n3. Click 'Upload Screenshot' button\n4. Select your screenshot file (max 5MB)\n5. Enter transaction ID from your payment app\n6. Click 'Submit Payment'\n\n✅ Make sure:\n• Screenshot is clear and readable\n• Transaction ID matches payment app\n• Both are submitted together",
        status: "Payment status types:\n\n⏳ Pending - Waiting for admin verification\n   • Payment submitted, under review\n   • Usually verified within 24-48 hours\n   • Check Dashboard for updates\n\n✅ Verified - Payment approved\n   • Membership activated\n   • Invoice generated\n   • Full access granted\n\n🚫 Rejected - Payment rejected\n   • Check reason in Dashboard\n   • Contact support via /contact\n   • Resubmit payment if needed\n\n💡 Tip: Only one pending payment allowed per membership. Wait for approval before submitting another.",
    },
    trainer: {
        assignment: "Trainer assignment:\n\n📋 Plan-based trainer access:\n• Premium Plan: 1 week FREE trainer (included)\n• Elite Plan: 1 month FREE trainer (included)\n• Basic Plan: No trainer included (add as addon)\n• Regular Monthly: No trainer included (add as addon)\n\n⏱️ Assignment timeline:\n• Assigned after membership approval\n• Admin assigns trainer based on availability\n• You'll see trainer info in Dashboard\n• Notification sent when assigned\n\n💡 Trainer addon:\n• Available for all plans\n• Can add during purchase or renewal\n• Separate pricing and duration",
        messaging: "Trainer messaging:\n\n✅ When you CAN message:\n• Trainer access is active (not expired)\n• Membership is active\n• Trainer is assigned\n\n❌ When you CANNOT message:\n• Trainer access expired\n• Trainer in grace period (5 days)\n• Regular Monthly plan expired (trainer revoked immediately)\n• Membership expired\n\n📱 How to message:\n• Dashboard → Click trainer name → 'Message' button\n• Or: /messages/trainer/[trainerId]\n\n💬 Keep it professional and fitness-related!",
        notAssigned: "If you don't have a trainer assigned:\n\n1️⃣ Check membership status:\n   • Must be 'Active' (not pending)\n   • Wait for admin approval first\n\n2️⃣ Check your plan:\n   • Basic Plan: No trainer included (add as addon)\n   • Regular Monthly: No trainer included (add as addon)\n   • Premium/Elite: Trainer included (assigned after approval)\n\n3️⃣ If eligible but not assigned:\n   • Admin may be assigning trainer\n   • Check Dashboard for updates\n   • Contact support via /contact if delayed\n\n⏱️ Assignment usually happens within 24-48 hours after membership approval.",
        renew: "Trainer renewal process:\n\n✅ Eligibility:\n• Membership must be 'Active'\n• Trainer access must be expired\n• At least 30 days remaining on membership\n\n📋 Steps:\n1. Go to Dashboard (/dashboard)\n2. Look for 'Renew Trainer' option\n3. Select trainer and duration (1-12 months)\n4. Complete payment\n5. Wait for admin approval (24-48 hours)\n\n⚠️ Important:\n• Trainer renewal is SEPARATE from membership renewal\n• Trainer access cannot exceed membership end date\n• Regular Monthly: If membership expires, trainer is revoked immediately\n• Invoice generated after approval\n\n💡 Trainer grace period: 5 days after expiry to renew",
        addon: "Trainer addon details:\n\n✅ Available for:\n• All plans (Basic, Premium, Elite, Regular Monthly)\n• Can add during initial purchase\n• Can add during membership renewal\n• Can add anytime (if membership active)\n\n💰 Pricing:\n• Varies by trainer (check /trainers page)\n• Duration: 1-12 months\n• Price = trainer rate × duration\n\n📋 How to add:\n1. During purchase: Select trainer addon in form\n2. During renewal: Select trainer addon option\n3. Complete payment\n4. Wait for admin approval\n\n⚠️ Regular Monthly: Trainer addon duration matches membership (1 month)",
        expiry: "Trainer access expiry:\n\n⏰ Expiry rules:\n• Trainer access expires on trainer_period_end date\n• After expiry: 5-day grace period to renew\n• During grace period: Cannot message trainer\n• After grace period: Trainer access revoked\n\n⚠️ Regular Monthly plans:\n• If membership expires, trainer access is IMMEDIATELY revoked\n• No grace period for trainer if membership expired\n• Must renew membership first to regain trainer access\n\n📊 Check status:\n• Dashboard shows trainer expiry date\n• Grace period alerts appear\n• Renew trainer before grace period ends\n\n💡 Trainer renewal requires:\n• Active membership\n• At least 30 days remaining on membership",
    },
    charts: {
        weekly: "Weekly fitness charts:\n\n📊 Chart types:\n• Workout charts: All plans (Basic, Premium, Elite, Regular Monthly)\n• Diet charts: Premium and Elite plans only\n\n👤 Who uploads:\n• Trainer: Uploads when trainer access is active\n• Admin: Uploads when trainer access expired\n• Uploaded weekly\n\n📅 View charts:\n• Dashboard → Weekly Charts section\n• Organized by week number\n• Download available for all charts\n\n⚠️ Regular Monthly plans:\n• If membership expired, charts may not be available\n• Renew membership to continue receiving charts",
        download: "Download weekly charts:\n\n1. Go to Dashboard (/dashboard)\n2. Scroll to 'Weekly Charts' section\n3. Click 'Download' button on any chart\n4. Charts available as PDF or image files\n\n✅ Available for:\n• All uploaded charts\n• Workout plans\n• Diet plans (Premium/Elite)\n• Historical charts\n\n💡 Download all charts to track your fitness journey!",
        missing: "If weekly charts are missing:\n\n1️⃣ Check membership status:\n   • Must be 'Active'\n   • Charts not available if expired\n\n2️⃣ Check your plan:\n   • Basic Plan: Workout charts only\n   • Premium/Elite: Workout + Diet charts\n   • Regular Monthly: Workout charts (if trainer assigned)\n\n3️⃣ Check trainer status:\n   • Trainer uploads when access is active\n   • Admin uploads when trainer expired\n   • Charts uploaded weekly\n\n4️⃣ If still missing:\n   • Contact your trainer\n   • Or use Contact page (/contact)\n   • Admin can upload charts manually",
    },
    dashboard: {
        overview: "Your Dashboard (/dashboard) shows:\n\n📊 Membership Overview\n• Current plan and status\n• Start/end dates\n• Grace period alerts (if applicable)\n• Renewal options\n\n👨‍🏫 Trainer Information\n• Trainer name and details\n• Trainer access expiry date\n• Message button (if access active)\n• Renew trainer option (if expired)\n\n📈 Weekly Charts\n• All your fitness charts\n• Download options\n• Week-by-week tracking\n\n📄 Invoices\n• Download all invoices\n• View payment history\n• Invoice types (Initial, Renewal, Trainer Renewal)\n\n👤 Profile\n• Quick access to edit profile\n\n💬 Messages\n• Link to message trainer (if access active)",
        features: "Dashboard features:\n\n✅ Real-time updates:\n• Membership status changes\n• Payment verification\n• Trainer assignment\n• New charts uploaded\n\n📊 Information display:\n• Membership details\n• Trainer information\n• Weekly charts\n• Invoice downloads\n• Payment history\n\n🔄 Actions available:\n• Renew membership (if in grace period)\n• Renew trainer (if expired)\n• Message trainer (if access active)\n• Download charts and invoices\n• Edit profile\n\n⚠️ Alerts:\n• Grace period warnings\n• Expiry notifications\n• Renewal reminders",
    },
    profile: {
        management: "Manage your profile at:\n/profile\n\nYou can:\n- View your profile\n- Edit personal information\n- Update full name\n- Change phone number\n- Update address\n- Change avatar/profile picture\n- Update date of birth\n- Change gender\n\nAll changes are saved automatically.",
        edit: "To edit your profile:\n1. Go to /profile\n2. Click 'Edit Profile' button\n3. Update any information\n4. Click 'Save Changes'\n\nYou can also access profile from Dashboard → Edit Profile button.",
    },
    password: {
        forgot: "If you forgot your password:\n\n🔐 Contact Admin:\n1. Go to Contact page (/contact)\n2. Send a message to admin\n3. Tell them you forgot your password\n4. Admin will reset your password\n5. Admin will provide you a temporary password\n6. Login with temporary password\n7. Then change it from Profile → Change Password\n\nNote: Only admin can reset forgotten passwords for security.",
        change: "To change your password (if you remember current password):\n\n1. Login to your account\n2. Go to Profile page (/profile)\n3. Scroll down to 'Change Password' section\n4. Click 'Change Password' button\n5. Enter:\n   - Current password\n   - New password (8+ chars, uppercase, lowercase, number, special char)\n   - Confirm new password\n6. Click 'Change Password'\n\nPassword requirements:\n- Minimum 8 characters\n- At least one uppercase letter\n- At least one lowercase letter\n- At least one number\n- At least one special character (!@#$%&*)",
        reset: "Password reset options:\n\n🔑 If you FORGOT password:\n→ Contact admin via /contact page\n→ Admin will reset and provide temporary password\n\n✏️ If you REMEMBER password:\n→ Go to Profile (/profile)\n→ Click 'Change Password'\n→ Enter current + new password\n\nBoth methods update your password in the system.",
        requirements: "Password requirements:\n\n✅ Minimum 8 characters\n✅ At least one uppercase letter (A-Z)\n✅ At least one lowercase letter (a-z)\n✅ At least one number (0-9)\n✅ At least one special character (!@#$%&*)\n\nExample: MyPass@123\n\nThese requirements apply to:\n- Signup\n- Password change\n- All password updates",
    },
    classes: {
        view: "You can view fitness classes at:\n/features page\n\nClasses show:\n- Class name and description\n- Schedule and timing\n- Duration\n- Maximum capacity\n- Class category\n\nNote: Class booking feature is currently not available. You can view class details only.",
        details: "To view class details:\n1. Go to /features page\n2. Browse available classes\n3. Click on any class to see full details\n4. View schedule, duration, and description\n\nClasses are managed by admin and updated regularly.",
    },
    offers: {
        promotions: "Check out our current offers and promotions at:\n/offers\n\nYou'll find:\n- Active offers and discounts\n- Special promotions\n- Limited time deals\n- Offer images and details\n\nOffers are updated regularly by admin. Visit the page to see current deals!",
    },
    trainers: {
        view: "View all trainers at:\n/trainers\n\nYou can see:\n- Trainer names and photos\n- Trainer profiles\n- Trainer pricing\n- Trainer availability\n\nTrainers are assigned based on your membership plan. Premium and Elite plans include trainer access.",
    },
    contact: {
        page: "Contact us at:\n/contact\n\nYou can:\n- Submit contact form\n- Chat with admin support\n- View gym contact details\n- Get address and location\n- See email and phone\n- Access gym information\n\nFor any issues, questions, or support, use the Contact page!",
        support: "For support:\n1. Go to /contact\n2. Fill out contact form\n3. Or start a chat with admin\n4. You'll receive response via email or chat\n\nContact page has all gym details including address, phone, and email.",
    },
    signup: {
        register: "To sign up:\n1. Go to /signup\n2. Enter your email and number\n3. Create a password\n4. Click 'Sign Up'\n5. Verify your email (if required)\n6. Complete your profile\n\nAfter signup, you can purchase membership and access all features!",
        login: "To log in:\n1. Go to /signup (login option)\n2. Enter your email and password\n3. Click 'Log In'\n\nAfter login, you'll have access to:\n- Dashboard\n- Membership purchase\n- Profile management\n- And all member features!",
    },
    features: {
        page: "View gym features at:\n/features\n\nYou'll see:\n- Detailed gym benefits\n- Equipment showcase\n- Facilities information\n- Class listings\n- Gym amenities\n\nThis page shows everything our gym offers!",
    },
    forbidden: "This action cannot be performed here. Please use the official website process or contact support through the Contact page (/contact).",
    escalation: "For this matter, please contact gym support using the Contact page (/contact) for further assistance. They'll be able to help you better with this issue.",
    inappropriate: {
        first: "Please maintain respectful language. I can help you with gym memberships, plans, or any website-related questions.",
        repeat: "Continued inappropriate language may result in restricted support. Let's keep the conversation professional.",
    },
    adminTrainer: "This assistance is available only for gym members and visitors. Please contact internal support.",
};

// Generate intelligent response based on user query
function generateResponse(message: string, conversationHistory: Array<{ role: string; content: string }>): string {
    const lowerMessage = message.toLowerCase().trim();
    const words = lowerMessage.split(/\s+/);
    const isSingleWord = words.length === 1;

    // Check for inappropriate content
    if (containsInappropriateContent(message)) {
        // Check if user has been warned before in this conversation
        const hasWarned = conversationHistory.some(
            msg => msg.role === 'assistant' && msg.content.includes('inappropriate language')
        );
        return hasWarned ? KNOWLEDGE_BASE.inappropriate.repeat : KNOWLEDGE_BASE.inappropriate.first;
    }

    // Admin/Trainer detection
    if (lowerMessage.includes('admin') && (lowerMessage.includes('login') || lowerMessage.includes('panel') || lowerMessage.includes('i am'))) {
        return KNOWLEDGE_BASE.adminTrainer;
    }
    if (lowerMessage.includes('trainer') && (lowerMessage.includes('login') || lowerMessage.includes('panel'))) {
        return KNOWLEDGE_BASE.adminTrainer;
    }
    if (lowerMessage.includes('approve') || lowerMessage.includes('database') || lowerMessage.includes('manual activation')) {
        return KNOWLEDGE_BASE.forbidden;
    }

    // Greetings (including single word)
    if (lowerMessage.match(/^(hi|hello|hey|hii|hiii|hiiii|good morning|good afternoon|good evening|gm|gn|morning|afternoon|evening)$/i) ||
        (isSingleWord && ['hi', 'hello', 'hey', 'hii', 'hiii', 'gm', 'gn'].includes(lowerMessage))) {
        return KNOWLEDGE_BASE.greeting[Math.floor(Math.random() * KNOWLEDGE_BASE.greeting.length)];
    }

    // Membership queries (including single words)
    if (isSingleWord && ['membership', 'member', 'plan', 'plans'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.membership.plans;
    }
    if (lowerMessage.includes('join') || lowerMessage.includes('become member') || lowerMessage.includes('how to join') ||
        lowerMessage === 'join' || lowerMessage === 'joining') {
        return KNOWLEDGE_BASE.membership.join;
    }
    if (lowerMessage.includes('purchase') || lowerMessage.includes('buy membership') || lowerMessage.includes('get membership') ||
        lowerMessage.includes('buy plan') || lowerMessage.includes('purchase membership') || lowerMessage === 'buy' || lowerMessage === 'purchase') {
        return KNOWLEDGE_BASE.membership.purchase;
    }
    if (lowerMessage.includes('plan') && (lowerMessage.includes('type') || lowerMessage.includes('available') || lowerMessage.includes('what') ||
        lowerMessage.includes('which') || lowerMessage.includes('list'))) {
        return KNOWLEDGE_BASE.membership.plans;
    }
    if (isSingleWord && ['plans', 'plan'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.membership.plans;
    }
    if (lowerMessage.includes('pending') || lowerMessage.includes('waiting') || lowerMessage.includes('not approved') ||
        lowerMessage.includes('approval') || lowerMessage === 'pending' || lowerMessage === 'waiting') {
        return KNOWLEDGE_BASE.membership.pending;
    }
    if (lowerMessage.includes('expired') || lowerMessage.includes('expire') || lowerMessage === 'expired' || lowerMessage === 'expire') {
        return KNOWLEDGE_BASE.membership.expired;
    }
    if ((lowerMessage.includes('renew') || lowerMessage.includes('renewal')) &&
        !lowerMessage.includes('trainer') &&
        lowerMessage !== 'renew' && lowerMessage !== 'renewal') {
        return KNOWLEDGE_BASE.membership.renewal;
    }
    if (lowerMessage === 'renew' || lowerMessage === 'renewal') {
        // Default to membership renewal, but mention trainer renewal option
        return KNOWLEDGE_BASE.membership.renewal + "\n\n💡 Note: Trainer renewal is separate. Ask 'trainer renewal' for details.";
    }
    if (lowerMessage.includes('my plans') || lowerMessage.includes('all memberships') || lowerMessage.includes('membership history') ||
        lowerMessage.includes('my membership') || lowerMessage === 'myplans' || lowerMessage === 'my-plans') {
        return KNOWLEDGE_BASE.membership.myPlans;
    }
    if (lowerMessage.includes('membership status') || (lowerMessage.includes('status') && lowerMessage.includes('membership')) ||
        lowerMessage === 'status' || lowerMessage === 'membership-status') {
        return KNOWLEDGE_BASE.membership.status;
    }

    // Payment queries (including single words)
    if (isSingleWord && ['payment', 'pay', 'qr', 'qrcode', 'qr-code'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.payment.qr;
    }
    if (lowerMessage.includes('qr code') || lowerMessage.includes('qr') || lowerMessage.includes('payment method') ||
        lowerMessage.includes('how to pay') || lowerMessage.includes('payment process') || lowerMessage === 'payment' ||
        lowerMessage === 'pay' || lowerMessage === 'qr' || lowerMessage === 'qrcode') {
        return KNOWLEDGE_BASE.payment.qr;
    }
    if (lowerMessage.includes('verify') || lowerMessage.includes('verification') || lowerMessage.includes('how long') ||
        lowerMessage.includes('payment time') || lowerMessage.includes('verify payment') || lowerMessage === 'verify' ||
        lowerMessage === 'verification') {
        return KNOWLEDGE_BASE.payment.verification;
    }
    if (lowerMessage.includes('refund') || lowerMessage.includes('dispute') || lowerMessage.includes('money back') ||
        lowerMessage === 'refund' || lowerMessage === 'refunds') {
        return KNOWLEDGE_BASE.payment.refund;
    }
    if (lowerMessage.includes('screenshot') || lowerMessage.includes('upload payment') || lowerMessage.includes('upload screenshot') ||
        lowerMessage === 'screenshot' || lowerMessage === 'upload') {
        return KNOWLEDGE_BASE.payment.screenshot;
    }

    // Trainer queries (including single words)
    if (isSingleWord && ['trainer', 'trainers'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.trainer.assignment;
    }
    if (lowerMessage.includes('trainer') && (lowerMessage.includes('assign') || lowerMessage.includes('get') || lowerMessage.includes('when') ||
        lowerMessage.includes('how') || lowerMessage.includes('who') || lowerMessage.includes('where'))) {
        return KNOWLEDGE_BASE.trainer.assignment;
    }
    if (lowerMessage.includes('message trainer') || lowerMessage.includes('chat with trainer') || lowerMessage.includes('contact trainer') ||
        (lowerMessage.includes('trainer') && lowerMessage.includes('message')) || lowerMessage.includes('trainer message') ||
        lowerMessage === 'message' || (lowerMessage.includes('message') && lowerMessage.includes('trainer'))) {
        return KNOWLEDGE_BASE.trainer.messaging;
    }
    if (lowerMessage.includes('no trainer') || lowerMessage.includes('trainer not') || lowerMessage.includes('not assigned') ||
        lowerMessage.includes('trainer missing') || lowerMessage.includes('no trainer assigned')) {
        return KNOWLEDGE_BASE.trainer.notAssigned;
    }
    if (lowerMessage.includes('renew trainer') || (lowerMessage.includes('trainer') && lowerMessage.includes('renew')) ||
        lowerMessage.includes('trainer renewal') || lowerMessage.includes('trainer access renew')) {
        return KNOWLEDGE_BASE.trainer.renew;
    }
    if (lowerMessage.includes('trainer addon') || (lowerMessage.includes('addon') && lowerMessage.includes('trainer')) ||
        lowerMessage === 'addon' || lowerMessage === 'addons') {
        return KNOWLEDGE_BASE.trainer.addon;
    }

    // Charts queries (including single words)
    if (isSingleWord && ['chart', 'charts', 'weekly', 'progress', 'workout', 'diet'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.charts.weekly;
    }
    if (lowerMessage.includes('chart') || lowerMessage.includes('progress') || lowerMessage.includes('weekly') ||
        lowerMessage.includes('workout plan') || lowerMessage.includes('diet plan') || lowerMessage === 'chart' ||
        lowerMessage === 'charts' || lowerMessage === 'weekly') {
        return KNOWLEDGE_BASE.charts.weekly;
    }
    if (lowerMessage.includes('download chart') || (lowerMessage.includes('chart') && lowerMessage.includes('download')) ||
        lowerMessage.includes('download charts') || lowerMessage === 'download' || lowerMessage.includes('how to download')) {
        return KNOWLEDGE_BASE.charts.download;
    }
    if (lowerMessage.includes('missing chart') || (lowerMessage.includes('chart') && lowerMessage.includes('missing')) ||
        (lowerMessage.includes('no chart')) || lowerMessage.includes('chart not') || lowerMessage.includes('no charts')) {
        return KNOWLEDGE_BASE.charts.missing;
    }

    // Dashboard queries (including single words)
    if (isSingleWord && ['dashboard', 'dash'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.dashboard.overview;
    }
    if (lowerMessage.includes('dashboard') || lowerMessage.includes('my dashboard') || lowerMessage === 'dashboard' ||
        lowerMessage === 'dash' || lowerMessage.includes('my dash')) {
        return KNOWLEDGE_BASE.dashboard.overview;
    }
    if (lowerMessage.includes('dashboard') && (lowerMessage.includes('feature') || lowerMessage.includes('what') ||
        lowerMessage.includes('show') || lowerMessage.includes('contains'))) {
        return KNOWLEDGE_BASE.dashboard.features;
    }

    // Classes queries (viewing only, no booking) - including single words
    if (isSingleWord && ['class', 'classes'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.classes.view;
    }
    if (lowerMessage.includes('class') && (lowerMessage.includes('view') || lowerMessage.includes('see') || lowerMessage.includes('available') ||
        lowerMessage.includes('list') || lowerMessage.includes('show'))) {
        return KNOWLEDGE_BASE.classes.view;
    }
    if (lowerMessage.includes('class') && (lowerMessage.includes('detail') || lowerMessage.includes('info') ||
        lowerMessage.includes('about'))) {
        return KNOWLEDGE_BASE.classes.details;
    }
    if (lowerMessage.includes('book class') || lowerMessage.includes('booking') || (lowerMessage.includes('class') && lowerMessage.includes('book')) ||
        lowerMessage === 'book' || lowerMessage === 'booking' || lowerMessage.includes('book a class')) {
        return "Class booking feature is currently not available. You can view class details and schedules at /features page. For class-related inquiries, please contact us through the Contact page.";
    }

    // Offers queries (including single words)
    if (isSingleWord && ['offer', 'offers', 'promotion', 'promotions', 'discount', 'deal', 'deals'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.offers.promotions;
    }
    if (lowerMessage.includes('offer') || lowerMessage.includes('promotion') || lowerMessage.includes('discount') ||
        lowerMessage.includes('deal') || lowerMessage === 'offer' || lowerMessage === 'offers' || lowerMessage === 'promotion') {
        return KNOWLEDGE_BASE.offers.promotions;
    }

    // Profile queries (including single words)
    if (isSingleWord && ['profile', 'profiles'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.profile.management;
    }
    if (lowerMessage.includes('profile') || lowerMessage.includes('update') || lowerMessage.includes('edit profile') ||
        lowerMessage.includes('change profile') || lowerMessage === 'profile' || lowerMessage === 'edit') {
        return KNOWLEDGE_BASE.profile.management;
    }
    if (lowerMessage.includes('edit profile') || (lowerMessage.includes('profile') && lowerMessage.includes('edit')) ||
        lowerMessage.includes('update profile') || lowerMessage.includes('change profile')) {
        return KNOWLEDGE_BASE.profile.edit;
    }

    // Password queries (including single words)
    if (isSingleWord && ['password', 'pass', 'pwd'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.password.reset;
    }
    if (lowerMessage.includes('forgot password') || lowerMessage.includes('password forgot') ||
        lowerMessage.includes('password bhul') || lowerMessage.includes('password bhool') ||
        lowerMessage.includes('password reset') || (lowerMessage.includes('password') && lowerMessage.includes('forgot')) ||
        lowerMessage.includes('lost password') || lowerMessage.includes('password lost') ||
        lowerMessage === 'forgot' || lowerMessage === 'reset password') {
        return KNOWLEDGE_BASE.password.forgot;
    }
    if (lowerMessage.includes('change password') || lowerMessage.includes('password change') ||
        (lowerMessage.includes('password') && lowerMessage.includes('change')) ||
        lowerMessage.includes('update password') || lowerMessage.includes('password update') ||
        lowerMessage.includes('modify password') || lowerMessage === 'change pass') {
        return KNOWLEDGE_BASE.password.change;
    }
    if (lowerMessage.includes('password requirement') || lowerMessage.includes('password rule') ||
        lowerMessage.includes('password criteria') || (lowerMessage.includes('password') && lowerMessage.includes('requirement')) ||
        lowerMessage.includes('what password') || lowerMessage.includes('password need') ||
        lowerMessage.includes('password must') || lowerMessage.includes('password should')) {
        return KNOWLEDGE_BASE.password.requirements;
    }
    if (lowerMessage.includes('password') && (lowerMessage.includes('how') || lowerMessage.includes('reset') ||
        lowerMessage.includes('recover') || lowerMessage.includes('help'))) {
        return KNOWLEDGE_BASE.password.reset;
    }

    // Trainers page queries (including single words)
    if (isSingleWord && ['trainers'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.trainers.view;
    }
    if (lowerMessage.includes('trainers') && (lowerMessage.includes('view') || lowerMessage.includes('see') || lowerMessage.includes('list') ||
        lowerMessage.includes('show') || lowerMessage.includes('available'))) {
        return KNOWLEDGE_BASE.trainers.view;
    }
    if (lowerMessage === 'trainers' || lowerMessage.includes('view trainers') || lowerMessage.includes('see trainers')) {
        return KNOWLEDGE_BASE.trainers.view;
    }

    // Contact queries (including single words)
    if (isSingleWord && ['contact', 'support', 'help', 'helpdesk'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.contact.page;
    }
    if (lowerMessage.includes('contact') || lowerMessage.includes('support') || lowerMessage.includes('help') ||
        lowerMessage.includes('reach') || lowerMessage === 'contact' || lowerMessage === 'support' || lowerMessage === 'help') {
        return KNOWLEDGE_BASE.contact.page;
    }
    if (lowerMessage.includes('contact') && (lowerMessage.includes('how') || lowerMessage.includes('where') ||
        lowerMessage.includes('phone') || lowerMessage.includes('email') || lowerMessage.includes('address'))) {
        return KNOWLEDGE_BASE.contact.support;
    }

    // Signup/Login queries (including single words)
    if (isSingleWord && ['signup', 'sign-up', 'register', 'registration'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.signup.register;
    }
    if (lowerMessage.includes('sign up') || lowerMessage.includes('register') || lowerMessage.includes('create account') ||
        lowerMessage === 'signup' || lowerMessage === 'sign-up' || lowerMessage === 'register') {
        return KNOWLEDGE_BASE.signup.register;
    }
    if (isSingleWord && ['login', 'log-in', 'signin', 'sign-in'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.signup.login;
    }
    if (lowerMessage.includes('log in') || lowerMessage.includes('login') || lowerMessage.includes('sign in') ||
        lowerMessage === 'login' || lowerMessage === 'log-in' || lowerMessage === 'signin') {
        return KNOWLEDGE_BASE.signup.login;
    }

    // Features page queries (including single words)
    if (isSingleWord && ['features', 'feature', 'benefits', 'gym'].includes(lowerMessage)) {
        return KNOWLEDGE_BASE.features.page;
    }
    if (lowerMessage.includes('features') || lowerMessage.includes('gym benefits') || lowerMessage.includes('what do you offer') ||
        lowerMessage.includes('what you offer') || lowerMessage === 'features' || lowerMessage === 'benefits') {
        return KNOWLEDGE_BASE.features.page;
    }

    // Invoice queries
    if (lowerMessage.includes('invoice') || lowerMessage.includes('bill') || lowerMessage.includes('receipt') ||
        lowerMessage === 'invoice' || lowerMessage === 'invoices' || lowerMessage === 'bill' || lowerMessage === 'receipt') {
        return "Invoices are automatically generated after payment approval:\n\n📄 Invoice types:\n• Initial Purchase - First membership payment\n• Membership Renewal - Plan renewal payment\n• Trainer Access Renewal - Trainer renewal payment\n\n📥 Download invoices:\n• Dashboard → Invoices section\n• Click 'Download' on any invoice\n• Available as PDF files\n\n✅ All approved payments have invoices\n• Generated automatically\n• Stored securely\n• Available anytime\n\n💡 Can't find invoice? Check Dashboard or contact support via /contact.";
    }

    // Grace period queries
    if (lowerMessage.includes('grace period') || lowerMessage.includes('grace') ||
        (lowerMessage.includes('expired') && lowerMessage.includes('renew'))) {
        return KNOWLEDGE_BASE.membership.gracePeriod;
    }

    // Regular Monthly plan queries
    if (lowerMessage.includes('regular monthly') || lowerMessage.includes('regular plan') ||
        lowerMessage.includes('monthly plan') || lowerMessage === 'regular') {
        return KNOWLEDGE_BASE.membership.regularMonthly;
    }

    // Trainer expiry queries
    if ((lowerMessage.includes('trainer') && lowerMessage.includes('expir')) ||
        lowerMessage.includes('trainer access end') || lowerMessage.includes('trainer period')) {
        return KNOWLEDGE_BASE.trainer.expiry;
    }

    // Admin approval timeline queries
    if (lowerMessage.includes('how long') && (lowerMessage.includes('approval') || lowerMessage.includes('verify') || lowerMessage.includes('approve'))) {
        return "Admin approval timeline:\n\n⏱️ Payment verification: 24-48 hours\n   • Usually approved within 24 hours\n   • Manual verification for security\n   • You'll receive notification when done\n\n⏱️ Membership activation: Immediate after approval\n   • Status changes to 'Active'\n   • Invoice generated automatically\n   • Trainer assigned (if applicable)\n\n⏱️ Trainer assignment: Within 24-48 hours\n   • After membership approval\n   • Based on trainer availability\n   • Notification sent when assigned\n\n💡 If it's been more than 48 hours:\n   • Check Dashboard for status\n   • Contact support via /contact\n   • Admin may need additional verification";
    }

    // Additional common queries
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('fee') || lowerMessage.includes('charges') ||
        lowerMessage === 'price' || lowerMessage === 'cost' || lowerMessage === 'fee') {
        return "Membership pricing:\n\n💪 Basic Plan:\n• Boys: ₹2,200 (3 months)\n• Girls: ₹2,400 (3 months)\n\n⭐ Premium Plan:\n• Boys: ₹4,000 (6 months)\n• Girls: ₹4,400 (6 months)\n• Includes 1 week free trainer\n\n🏆 Elite Plan:\n• Boys: ₹6,800 (12 months)\n• Girls: ₹7,800 (12 months)\n• Includes 1 month free trainer\n\n🏋️ Regular Monthly:\n• Boys: ₹1,200 first payment, ₹650/month after\n• Girls: ₹1,400 first payment, ₹700/month after\n\n💡 Trainer addon: Varies by trainer (check /trainers)\n\nVisit /membership for complete pricing details!";
    }
    if (lowerMessage.includes('duration') || lowerMessage.includes('how long') || lowerMessage === 'duration' || lowerMessage === 'period') {
        return "Membership durations available:\n- 1 month\n- 3 months\n- 6 months\n- 12 months\n\nChoose your preferred duration when purchasing a plan. Longer durations may have better value!";
    }
    if (lowerMessage.includes('active') || lowerMessage.includes('activated') || lowerMessage === 'active' || lowerMessage === 'activate') {
        return "Membership activation process:\n\n1️⃣ Payment submitted:\n   • Upload screenshot + transaction ID\n   • Status: 'Pending'\n\n2️⃣ Admin verification:\n   • Manual verification (24-48 hours)\n   • Payment checked and approved\n\n3️⃣ Membership activated:\n   • Status changes to 'Active'\n   • Invoice generated automatically\n   • Trainer assigned (if applicable)\n   • Full access granted\n\n📊 Check status:\n   • Dashboard → Membership status\n   • Real-time updates\n   • Notification sent when activated\n\n✅ Active membership means:\n   • Full access to all features\n   • Trainer access (if assigned)\n   • Weekly charts available\n   • Can message trainer (if access active)";
    }
    if (lowerMessage.includes('rejected') || lowerMessage.includes('reject') || lowerMessage === 'rejected' || lowerMessage === 'reject') {
        return "If your payment was rejected:\n\n1️⃣ Check reason:\n   • Dashboard → Payment status\n   • View rejection reason\n\n2️⃣ Common reasons:\n   • Payment screenshot unclear\n   • Transaction ID mismatch\n   • Payment amount incorrect\n   • Duplicate payment\n\n3️⃣ Next steps:\n   • Contact support via /contact\n   • Resubmit payment if needed\n   • Ensure screenshot and transaction ID are correct\n\n💡 Support team will help resolve the issue!";
    }
    if (lowerMessage.includes('transaction') || lowerMessage.includes('transaction id') || lowerMessage === 'transaction' || lowerMessage === 'txn') {
        return "Transaction ID is required when submitting payment:\n1. After making payment via QR code\n2. Find transaction ID in your payment app\n3. Enter it on payment page (/membership/payment)\n4. Upload payment screenshot\n5. Submit for verification\n\nTransaction ID helps us verify your payment quickly.";
    }
    if (lowerMessage.includes('notification') || lowerMessage.includes('notify') || lowerMessage === 'notification' || lowerMessage === 'notifications') {
        return "Notifications you'll receive:\n\n✅ Membership notifications:\n• Payment submitted\n• Payment verified\n• Membership approved\n• Membership expired\n• Grace period started\n• Grace period ending\n\n👨‍🏫 Trainer notifications:\n• Trainer assigned\n• Trainer access expiring\n• Trainer grace period started\n• Trainer access expired\n\n📊 Chart notifications:\n• New weekly chart uploaded\n• Chart reminder (if missing)\n\n💬 Message notifications:\n• New message from trainer\n\n📄 Invoice notifications:\n• Invoice generated\n\n🔔 Check notifications:\n• Dashboard notification bell\n• Real-time updates\n• Email notifications (if enabled)\n\n💡 All notifications appear in Dashboard!";
    }
    if (lowerMessage.includes('address') || lowerMessage.includes('location') || lowerMessage.includes('where') || lowerMessage === 'address' || lowerMessage === 'location') {
        return "Gym address and contact details are available on:\n/contact page\n\nYou'll find:\n- Full gym address\n- Google Maps location\n- Contact phone number\n- Email address\n- Operating hours\n\nVisit /contact for complete information!";
    }
    if (lowerMessage.includes('phone') || lowerMessage.includes('number') || lowerMessage.includes('call') || lowerMessage === 'phone' || lowerMessage === 'call') {
        return "Gym contact phone number is available on:\n/contact page\n\nYou can:\n- Call directly\n- View contact details\n- Get support\n- Ask questions\n\nVisit /contact for phone number and all contact information!";
    }
    if (lowerMessage.includes('email') || lowerMessage === 'email') {
        return "Gym email address is available on:\n/contact page\n\nYou can:\n- Email directly\n- Get support via email\n- Contact for inquiries\n\nVisit /contact for email address and all contact information!";
    }
    if (lowerMessage.includes('hours') || lowerMessage.includes('timing') || lowerMessage.includes('open') || lowerMessage === 'hours' || lowerMessage === 'timing') {
        return "Gym operating hours and timings are available on:\n/contact page\n\nVisit /contact to see:\n- Opening hours\n- Closing time\n- Days of operation\n- Special timings\n\nAll timing information is displayed there!";
    }
    if (lowerMessage.includes('basic') || lowerMessage === 'basic') {
        return "Basic Plan features:\n\n💪 Plan details:\n• Online mode only\n• Workout charts included\n• No trainer included (can add as addon)\n• Available: 3, 6, or 12 months\n\n💰 Pricing:\n• Boys: ₹2,200 (3 months)\n• Girls: ₹2,400 (3 months)\n\n✅ What you get:\n• Weekly workout plans\n• Progress tracking\n• Online support\n• Trainer addon available\n\nVisit /membership for complete details!";
    }
    if (lowerMessage.includes('premium') || lowerMessage === 'premium') {
        return "Premium Plan features:\n\n⭐ Plan details:\n• Online mode\n• 1 week FREE trainer access (included)\n• Workout + Diet charts\n• Available: 3, 6, or 12 months\n\n💰 Pricing:\n• Boys: ₹4,000 (6 months)\n• Girls: ₹4,400 (6 months)\n\n✅ What you get:\n• Weekly workout plans\n• Weekly diet plans\n• 1 week free trainer\n• Trainer messaging\n• Trainer addon available\n\nVisit /membership for complete details!";
    }
    if (lowerMessage.includes('elite') || lowerMessage === 'elite') {
        return "Elite Plan features:\n\n🏆 Plan details:\n• Online mode\n• 1 month FREE trainer access (included)\n• Workout + Diet charts\n• Available: 3, 6, or 12 months\n• Best value for long-term\n\n💰 Pricing:\n• Boys: ₹6,800 (12 months)\n• Girls: ₹7,800 (12 months)\n\n✅ What you get:\n• Weekly workout plans\n• Weekly diet plans\n• 1 month free trainer\n• Trainer messaging\n• Trainer addon available\n• Priority support\n\nVisit /membership for complete details!";
    }
    if (lowerMessage.includes('workout') || lowerMessage === 'workout' || lowerMessage === 'workouts') {
        return "Workout charts:\n- Available for all plans\n- Uploaded weekly by trainer\n- View in Dashboard → Weekly Charts\n- Download as PDF/image\n- Track your fitness progress\n\nBasic plan gets workout charts, Premium/Elite get both workout and diet charts!";
    }
    if (lowerMessage.includes('diet') || lowerMessage === 'diet') {
        return "Diet charts:\n- Available for Premium and Elite plans only\n- Uploaded weekly by trainer\n- View in Dashboard → Weekly Charts\n- Download as PDF/image\n- Personalized nutrition plans\n\nBasic plan includes workout charts only. Upgrade to Premium/Elite for diet charts!";
    }
    if (lowerMessage.includes('form') || lowerMessage === 'form' || lowerMessage === 'application') {
        return "Membership form is at:\n/membership/form\n\nForm includes:\n- Personal information\n- Plan selection\n- Duration selection\n- Trainer selection (optional)\n- Review and submit\n\nFill the form to start your membership process!";
    }
    if (lowerMessage.includes('my-plans') || lowerMessage.includes('my plans') || lowerMessage === 'myplans') {
        return KNOWLEDGE_BASE.membership.myPlans;
    }
    if (lowerMessage.includes('renew-plan') || lowerMessage.includes('renew plan') || lowerMessage === 'renewplan') {
        return KNOWLEDGE_BASE.membership.renewal;
    }
    if (lowerMessage.includes('renew-trainer') || lowerMessage.includes('renew trainer') || lowerMessage === 'renewtrainer') {
        return KNOWLEDGE_BASE.trainer.renew;
    }

    // Invoice queries
    if (lowerMessage.includes('invoice') || lowerMessage.includes('bill') || lowerMessage.includes('receipt') ||
        lowerMessage === 'invoice' || lowerMessage === 'invoices' || lowerMessage === 'bill' || lowerMessage === 'receipt') {
        return "Invoices are automatically generated after payment approval:\n\n📄 Invoice types:\n• Initial Purchase - First membership payment\n• Membership Renewal - Plan renewal payment\n• Trainer Access Renewal - Trainer renewal payment\n\n📥 Download invoices:\n• Dashboard → Invoices section\n• Click 'Download' on any invoice\n• Available as PDF files\n\n✅ All approved payments have invoices\n• Generated automatically\n• Stored securely\n• Available anytime\n\n💡 Can't find invoice? Check Dashboard or contact support via /contact.";
    }

    // Grace period queries
    if (lowerMessage.includes('grace period') || lowerMessage.includes('grace') ||
        (lowerMessage.includes('expired') && lowerMessage.includes('renew'))) {
        return KNOWLEDGE_BASE.membership.gracePeriod;
    }

    // Regular Monthly plan queries
    if (lowerMessage.includes('regular monthly') || lowerMessage.includes('regular plan') ||
        lowerMessage.includes('monthly plan') || lowerMessage === 'regular') {
        return KNOWLEDGE_BASE.membership.regularMonthly;
    }

    // Trainer expiry queries
    if ((lowerMessage.includes('trainer') && lowerMessage.includes('expir')) ||
        lowerMessage.includes('trainer access end') || lowerMessage.includes('trainer period')) {
        return KNOWLEDGE_BASE.trainer.expiry;
    }

    // Admin approval timeline queries
    if (lowerMessage.includes('how long') && (lowerMessage.includes('approval') || lowerMessage.includes('verify') || lowerMessage.includes('approve'))) {
        return "Admin approval timeline:\n\n⏱️ Payment verification: 24-48 hours\n   • Usually approved within 24 hours\n   • Manual verification for security\n   • You'll receive notification when done\n\n⏱️ Membership activation: Immediate after approval\n   • Status changes to 'Active'\n   • Invoice generated automatically\n   • Trainer assigned (if applicable)\n\n⏱️ Trainer assignment: Within 24-48 hours\n   • After membership approval\n   • Based on trainer availability\n   • Notification sent when assigned\n\n💡 If it's been more than 48 hours:\n   • Check Dashboard for status\n   • Contact support via /contact\n   • Admin may need additional verification";
    }

    // Payment status queries
    if (lowerMessage.includes('payment status') || (lowerMessage.includes('status') && lowerMessage.includes('payment'))) {
        return KNOWLEDGE_BASE.payment.status;
    }

    // Eligibility queries
    if (lowerMessage.includes('eligible') || lowerMessage.includes('can i renew') || lowerMessage.includes('when can i')) {
        return "Renewal eligibility:\n\n✅ Membership renewal:\n• Status must be 'Grace Period'\n• 15 days after membership expiry\n• Renew from Dashboard\n• Complete payment process\n\n✅ Trainer renewal:\n• Membership must be 'Active'\n• Trainer access must be expired\n• At least 30 days remaining on membership\n• Renew trainer separately\n\n⚠️ Regular Monthly:\n• If membership expired, trainer revoked immediately\n• Must renew membership first\n• Trainer addon available on renewal\n\n💡 Check Dashboard for eligibility status and renewal options!";
    }

    // Blocked actions queries
    if (lowerMessage.includes('cannot') || lowerMessage.includes('can\'t') || lowerMessage.includes('not allowed') ||
        lowerMessage.includes('why can\'t') || lowerMessage.includes('blocked')) {
        return "Actions that require admin approval:\n\n⏳ Cannot be automated:\n• Payment verification (manual admin check)\n• Membership approval (admin decision)\n• Trainer assignment (admin assigns)\n• Payment rejection (admin reviews)\n\n❌ Cannot do when:\n• Payment pending: Cannot submit another payment\n• Membership expired (grace period ended): Cannot renew\n• Trainer expired (grace period ended): Cannot renew trainer\n• Regular Monthly expired: Trainer access revoked immediately\n\n💡 What you CAN do:\n• Submit payment and wait for approval\n• Renew during grace period\n• Contact support via /contact\n• Check Dashboard for status\n\nFor admin actions, please wait for approval or contact support!";
    }

    // Legal/complaint escalation
    if (lowerMessage.includes('legal') || lowerMessage.includes('complaint') || lowerMessage.includes('sue') || lowerMessage.includes('lawyer')) {
        return KNOWLEDGE_BASE.escalation;
    }

    // Default helpful response with more options
    return "I can help you with:\n\n💪 Membership Plans\n• View plans (Basic, Premium, Elite, Regular Monthly)\n• Purchase membership\n• Check status\n• Renew membership (grace period)\n• Regular Monthly plan details\n• Pricing information\n\n💳 Payment & Invoices\n• QR code payment\n• Upload screenshot\n• Payment verification (24-48 hours)\n• Transaction ID\n• Download invoices\n• Payment status\n\n🔄 Renewals\n• Membership renewal (grace period)\n• Trainer renewal (separate process)\n• Renewal eligibility\n• Grace period rules\n\n👨‍🏫 Trainers\n• Trainer assignment\n• Message trainer (access rules)\n• Trainer addon\n• Renew trainer\n• Trainer expiry & grace period\n• Regular Monthly trainer rules\n\n📊 Weekly Charts\n• View charts\n• Download charts\n• Workout & diet plans\n• Chart availability by plan\n\n📄 Invoices\n• Download invoices\n• Invoice types\n• Invoice availability\n\n📅 Classes\n• View class details\n• Class schedules\n\n🎁 Offers\n• Current promotions\n• Special deals\n\n👤 Profile\n• Edit profile\n• Update information\n• Change password\n\n🔐 Password\n• Forgot password? Contact admin\n• Change password? Go to Profile\n• Password requirements\n\n📞 Contact\n• Support & help\n• Gym information\n• Address & phone\n\n🏠 Dashboard\n• All features overview\n• Status updates\n• Renewal options\n\n💡 Try asking:\n• \"invoice\"\n• \"grace period\"\n• \"trainer renewal\"\n• \"regular monthly\"\n• \"payment status\"\n• \"admin approval\"\n\nWhat would you like to know more about? Ask me anything about the website!";
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, conversationHistory = [] } = body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        // Check if user is admin or trainer - block them
        const isBlocked = await isAdminOrTrainer();
        if (isBlocked) {
            return NextResponse.json(
                { error: 'This service is not available for admins or trainers' },
                { status: 403 }
            );
        }

        // Generate response
        const response = generateResponse(message, conversationHistory);

        return NextResponse.json({
            response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chatbot API error:', error);
        return NextResponse.json(
            { error: 'Failed to process request. Please try again.' },
            { status: 500 }
        );
    }
}

