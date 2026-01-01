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

// Knowledge base for responses
const KNOWLEDGE_BASE = {
    greeting: [
        "Hello! I'm The24FitBot, your virtual assistant 💪 How can I help you today?",
        "Hi there! Welcome to 24 Fitness Gym. I'm here to help you with memberships, plans, and more!",
        "Hey! 👋 I'm The24FitBot. What can I help you with today?"
    ],
    membership: {
        join: "To join our gym:\n1. Sign up or log in to your account (/signup)\n2. Go to Membership page (/membership)\n3. Choose a plan (Basic, Premium, or Elite)\n4. Fill membership form with your details\n5. Complete payment via QR code\n6. Upload payment screenshot and transaction ID\n7. Wait for admin approval\n\nOnce approved, your membership will be activated! 💪",
        purchase: "Membership purchase process:\n1. Go to Membership page (/membership)\n2. Select your preferred plan (Basic/Premium/Elite)\n3. Choose duration (1, 3, 6, or 12 months)\n4. Fill membership form (/membership/form)\n5. Go to payment page - you'll see a QR code\n6. Complete payment and upload:\n   - Payment screenshot\n   - Transaction ID\n7. Payment will be manually verified\n8. Membership activates after admin approval",
        plans: "We offer three membership plans:\n\n💪 Basic Plan - Online mode only\n⭐ Premium Plan - Includes 1 week free trainer access\n🏆 Elite Plan - Includes 1 month free trainer access\n\nAll plans available in 3, 6, or 12 month durations.\nVisit /membership to see detailed pricing and features!",
        pending: "If your payment is pending, it means it's waiting for admin verification. This is normal! Our team manually verifies each payment to ensure security. You'll receive a notification once your membership is approved. Usually takes 24-48 hours.",
        expired: "If your membership has expired, you can renew it from:\nDashboard → My Plans (/membership/my-plans)\n\nOr use the Renew Plan option from your dashboard. Renewal follows the same process as a new membership.",
        renewal: "To renew your membership:\n1. Go to Dashboard (/dashboard)\n2. Click on 'My Plans' or 'Renew Plan'\n3. Select your plan and duration\n4. Complete payment process\n5. Wait for approval\n\nYour new membership will start after the current one expires or immediately after approval.",
        myPlans: "View all your memberships at:\n/membership/my-plans\n\nHere you can see:\n- All your membership history\n- Current and past memberships\n- Membership status\n- Renewal options",
        invoice: "Invoices are automatically generated after your membership is approved. You can find them in:\nDashboard → Invoices section\n\nYou can download invoices as PDF files. If you don't see an invoice, it means your membership is still pending approval.",
        status: "Check your membership status in:\nDashboard (/dashboard)\n\nStatus types:\n✅ Active - Membership is active and running\n⏳ Pending - Waiting for admin approval\n❌ Expired - Membership has ended\n🚫 Rejected - Payment was rejected",
    },
    payment: {
        qr: "Payment is done via QR code only. Here's how:\n1. Complete membership form\n2. Go to payment page (/membership/payment)\n3. Scan or view the QR code displayed\n4. Complete payment through your payment app (UPI, Paytm, etc.)\n5. Upload payment screenshot\n6. Enter transaction ID\n7. Submit for verification\n\nPayment verification takes 24-48 hours.",
        verification: "Payment verification is done manually by our admin team. This usually takes 24-48 hours. You'll receive a notification once your payment is verified and membership is activated. Check your dashboard for status updates.",
        refund: "For refunds, payment disputes, or payment-related issues, please contact gym support through the Contact page (/contact). I can't process refunds directly.",
        screenshot: "To upload payment screenshot:\n1. After making payment, take a screenshot\n2. Go to payment page (/membership/payment)\n3. Click 'Upload Screenshot' button\n4. Select your screenshot file\n5. Enter transaction ID\n6. Submit",
    },
    trainer: {
        assignment: "Trainers are assigned to members after membership activation:\n\n- Premium Plan: Includes 1 week free trainer\n- Elite Plan: Includes 1 month free trainer\n- Basic Plan: No trainer included (can add as addon)\n\nOnce your membership is approved, admin will assign you a trainer. You'll see trainer info in your Dashboard.",
        messaging: "You can message your assigned trainer from:\nDashboard → Click on trainer name → Message\n\nOr directly: /messages/trainer/[trainerId]\n\nMessaging is for professional fitness-related communication only. Please maintain respectful conversations.",
        notAssigned: "If you don't have a trainer assigned yet, it's likely because:\n1. Your membership is still pending approval\n2. Trainer assignment is in progress\n3. You have Basic plan (no trainer included)\n\nOnce your membership is active, a trainer will be assigned if your plan includes it.",
        renew: "To renew trainer access:\n1. Go to Dashboard\n2. Look for 'Renew Trainer' option\n3. Select trainer and duration\n4. Complete payment\n5. Wait for approval\n\nTrainer renewal is separate from membership renewal.",
        addon: "Trainer addon allows you to add a trainer to your membership:\n1. Available for all plans\n2. Can be added during membership purchase\n3. Or added later as an addon\n4. Trainer addon has its own duration and pricing\n\nCheck Dashboard for trainer addon options.",
    },
    charts: {
        weekly: "Weekly fitness charts are uploaded by your assigned trainer or admin. You can view them in:\nDashboard → Weekly Charts section\n\nThese charts show:\n- Workout plans (all plans)\n- Diet plans (Premium/Elite only)\n\nCharts are organized by week number.",
        download: "Yes! You can download your weekly charts:\n1. Go to Dashboard\n2. Scroll to Weekly Charts section\n3. Click 'Download' button on any chart\n4. Charts are available as PDF or image files\n\nDownload all your charts to track your fitness journey!",
        missing: "If you don't see weekly charts:\n1. Check if your membership is active\n2. Verify trainer is assigned\n3. Charts are uploaded weekly by trainer\n4. Basic plan only gets workout charts\n5. Premium/Elite get both workout and diet charts\n\nIf charts are missing, contact your trainer or use Contact page.",
    },
    dashboard: {
        overview: "Your Dashboard (/dashboard) shows:\n\n📊 Membership Overview\n- Current plan and status\n- Start/end dates\n- Trainer information\n\n📈 Weekly Charts\n- All your fitness charts\n- Download options\n\n💰 Invoices\n- All membership invoices\n- Download as PDF\n\n👤 Profile\n- Quick access to edit profile\n\n💬 Messages\n- Link to message trainer",
        features: "Dashboard features:\n- Real-time membership status\n- Weekly charts viewing and download\n- Invoice management\n- Trainer information and messaging\n- Profile quick access\n- Membership history\n- Payment summary",
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
    if (lowerMessage.includes('renew') || lowerMessage.includes('renewal') || lowerMessage === 'renew' || lowerMessage === 'renewal') {
        return KNOWLEDGE_BASE.membership.renewal;
    }
    if (lowerMessage.includes('my plans') || lowerMessage.includes('all memberships') || lowerMessage.includes('membership history') ||
        lowerMessage.includes('my membership') || lowerMessage === 'myplans' || lowerMessage === 'my-plans') {
        return KNOWLEDGE_BASE.membership.myPlans;
    }
    if (lowerMessage.includes('invoice') || lowerMessage.includes('receipt') || lowerMessage.includes('bill') ||
        lowerMessage === 'invoice' || lowerMessage === 'receipt' || lowerMessage === 'bill' || lowerMessage === 'invoices') {
        return KNOWLEDGE_BASE.membership.invoice;
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
        lowerMessage.includes('trainer renewal')) {
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

    // Additional common queries
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('fee') || lowerMessage.includes('charges') ||
        lowerMessage === 'price' || lowerMessage === 'cost' || lowerMessage === 'fee') {
        return "Membership pricing varies by plan and duration:\n\n💪 Basic Plan - Check /membership for current prices\n⭐ Premium Plan - Includes 1 week free trainer\n🏆 Elite Plan - Includes 1 month free trainer\n\nVisit /membership page to see detailed pricing for all plans (3, 6, 12 months).";
    }
    if (lowerMessage.includes('duration') || lowerMessage.includes('how long') || lowerMessage === 'duration' || lowerMessage === 'period') {
        return "Membership durations available:\n- 1 month\n- 3 months\n- 6 months\n- 12 months\n\nChoose your preferred duration when purchasing a plan. Longer durations may have better value!";
    }
    if (lowerMessage.includes('active') || lowerMessage.includes('activated') || lowerMessage === 'active' || lowerMessage === 'activate') {
        return "Your membership becomes active after:\n1. Payment is submitted\n2. Admin verifies payment\n3. Membership is approved\n\nCheck your Dashboard (/dashboard) to see current membership status. Active memberships show as 'Active' status.";
    }
    if (lowerMessage.includes('rejected') || lowerMessage.includes('reject') || lowerMessage === 'rejected' || lowerMessage === 'reject') {
        return "If your membership was rejected:\n1. Check the reason in your Dashboard\n2. Contact support through /contact page\n3. You may need to resubmit payment\n4. Ensure payment screenshot and transaction ID are correct\n\nOur support team can help resolve the issue.";
    }
    if (lowerMessage.includes('transaction') || lowerMessage.includes('transaction id') || lowerMessage === 'transaction' || lowerMessage === 'txn') {
        return "Transaction ID is required when submitting payment:\n1. After making payment via QR code\n2. Find transaction ID in your payment app\n3. Enter it on payment page (/membership/payment)\n4. Upload payment screenshot\n5. Submit for verification\n\nTransaction ID helps us verify your payment quickly.";
    }
    if (lowerMessage.includes('notification') || lowerMessage.includes('notify') || lowerMessage === 'notification' || lowerMessage === 'notifications') {
        return "You'll receive notifications for:\n- Membership approval\n- Payment verification\n- Trainer assignment\n- New weekly charts\n- Messages from trainer\n\nCheck your Dashboard and notification bell for updates!";
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
        return "Basic Plan features:\n- Online mode only\n- Workout charts included\n- No trainer included (can add as addon)\n- All membership durations available\n\nVisit /membership to see Basic Plan pricing and details!";
    }
    if (lowerMessage.includes('premium') || lowerMessage === 'premium') {
        return "Premium Plan features:\n- Includes 1 week FREE trainer access\n- Workout and diet charts\n- Trainer messaging\n- All membership durations available\n\nVisit /membership to see Premium Plan pricing and details!";
    }
    if (lowerMessage.includes('elite') || lowerMessage === 'elite') {
        return "Elite Plan features:\n- Includes 1 month FREE trainer access\n- Workout and diet charts\n- Trainer messaging\n- All membership durations available\n- Best value for long-term members\n\nVisit /membership to see Elite Plan pricing and details!";
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

    // Legal/complaint escalation
    if (lowerMessage.includes('legal') || lowerMessage.includes('complaint') || lowerMessage.includes('sue') || lowerMessage.includes('lawyer')) {
        return KNOWLEDGE_BASE.escalation;
    }

    // Default helpful response with more options
    return "I can help you with:\n\n💪 Membership Plans\n- View plans (Basic, Premium, Elite)\n- Purchase membership\n- Check status\n- Renew membership\n- View all plans\n- Pricing information\n\n💳 Payment\n- QR code payment\n- Upload screenshot\n- Payment verification\n- Transaction ID\n\n📄 Invoices\n- Download invoices\n- View invoice history\n\n👨‍🏫 Trainers\n- Trainer assignment\n- Message trainer\n- Trainer addon\n- Renew trainer\n\n📊 Weekly Charts\n- View charts\n- Download charts\n- Workout & diet plans\n\n📅 Classes\n- View class details\n- Class schedules\n\n🎁 Offers\n- Current promotions\n- Special deals\n\n👤 Profile\n- Edit profile\n- Update information\n- Change password\n\n🔐 Password\n- Forgot password? Contact admin\n- Change password? Go to Profile\n- Password requirements\n\n📞 Contact\n- Support & help\n- Gym information\n- Address & phone\n\n🏠 Dashboard\n- All features overview\n\n💡 Try asking:\n- \"invoice\" (single word works!)\n- \"payment\"\n- \"trainer\"\n- \"dashboard\"\n- \"password\"\n- \"plans\"\n\nWhat would you like to know more about? Ask me anything about the website!";
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

