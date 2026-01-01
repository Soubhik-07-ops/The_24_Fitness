# 🔐 Google Sign-In Setup Guide

## ✅ Features Added

### **Continue with Google Button**
- Added to both Signup and Login pages
- One-click Google authentication
- Automatic account creation
- Profile auto-creation from Google data

---

## 🚀 How It Works

### **User Flow:**
1. User clicks "Continue with Google"
2. Redirected to Google OAuth
3. User selects Google account
4. Google redirects back to `/auth/callback`
5. Account created automatically (if new user)
6. Profile created from Google data
7. User logged in and redirected to home

---

## ⚙️ Supabase Configuration Required

### **Step 1: Enable Google Provider in Supabase**

1. **Go to Supabase Dashboard**
   - Open your project
   - Navigate to **Authentication** → **Providers**

2. **Enable Google Provider**
   - Find "Google" in the list
   - Toggle it **ON**
   - Click "Configure"

3. **Add Google OAuth Credentials**
   - **Client ID**: From Google Cloud Console
   - **Client Secret**: From Google Cloud Console
   - **Redirect URL**: `https://yourdomain.com/auth/callback`
     - For local dev: `http://localhost:3000/auth/callback`

4. **Save Configuration**

---

## 🔧 Google Cloud Console Setup

### **Step 1: Create OAuth Credentials**

1. **Go to Google Cloud Console**
   - https://console.cloud.google.com/
   - Select your project (or create new)

2. **Navigate to APIs & Services → Credentials**

3. **Create OAuth 2.0 Client ID**
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Name: "24 Fitness Gym" (or your app name)

4. **Add Authorized Redirect URIs:**
   ```
   http://localhost:3000/auth/callback  (for development)
   https://yourdomain.com/auth/callback  (for production)
   ```

5. **Copy Credentials**
   - Client ID
   - Client Secret
   - Add to Supabase (Step 1 above)

---

## 📋 Environment Variables

**No additional env variables needed!**
- Uses existing `NEXT_PUBLIC_SUPABASE_URL`
- Uses existing `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Google credentials stored in Supabase Dashboard

---

## 🎯 Features

### **Automatic Profile Creation:**
- Full name from Google account
- Email from Google account
- Phone number: Optional (can add later in Profile)
- Avatar: From Google (if available)

### **New User:**
- Account created automatically
- Profile created with Google data
- Signup notification sent
- Redirected to home page

### **Existing User:**
- Logged in directly
- No duplicate account created
- Redirected to home page

---

## 🔒 Security

- ✅ OAuth 2.0 secure authentication
- ✅ No passwords stored for Google users
- ✅ Secure token exchange
- ✅ Automatic session management
- ✅ Profile data from verified Google account

---

## 📁 Files Modified/Created

### **New Files:**
1. `src/app/auth/callback/route.ts`
   - OAuth callback handler
   - Profile creation for new users
   - Session management

### **Modified Files:**
1. `src/components/Auth/AuthForm.tsx`
   - Added Google sign-in button
   - Added Google sign-in handler
   - Loading states

2. `src/components/Auth/AuthForm.module.css`
   - Google button styles
   - Divider styles
   - Loading states

---

## 🧪 Testing

### **Test Flow:**
1. Go to `/signup` page
2. Click "Continue with Google"
3. Select Google account
4. Should redirect back and log in
5. Check Dashboard - should be logged in
6. Check Profile - should have Google data

### **Test Cases:**
- [ ] New user signup with Google
- [ ] Existing user login with Google
- [ ] Profile created correctly
- [ ] Redirect works
- [ ] Session persists
- [ ] Error handling works

---

## ⚠️ Important Notes

### **Phone Number:**
- **Optional for Google users** (can add later)
- Regular signup still requires phone
- Google users can add phone in Profile page

### **Password:**
- Google users don't have password
- Can't use email/password login
- Must use Google sign-in always
- Can set password later (if needed)

### **Profile Data:**
- Full name: From Google account
- Email: From Google account
- Phone: Optional (null initially)
- Avatar: Can be added later

---

## 🐛 Troubleshooting

### **Error: "redirect_uri_mismatch"**
- Check redirect URL in Google Cloud Console
- Must match exactly: `http://localhost:3000/auth/callback`
- Check Supabase redirect URL setting

### **Error: "Invalid client"**
- Verify Client ID and Secret in Supabase
- Check Google Cloud Console credentials
- Ensure OAuth consent screen is configured

### **Error: "Provider not enabled"**
- Enable Google provider in Supabase Dashboard
- Check Authentication → Providers → Google

### **Profile not created:**
- Check Supabase logs
- Verify `profiles` table exists
- Check RLS policies allow insert

---

## ✅ Summary

**What's Added:**
- ✅ Google sign-in button
- ✅ OAuth callback handler
- ✅ Automatic profile creation
- ✅ Seamless login/signup

**What's Needed:**
- ⚙️ Configure Google OAuth in Supabase Dashboard
- ⚙️ Add Google credentials from Google Cloud Console
- ⚙️ Set redirect URLs

**Ready to use after Supabase configuration!** 🎉



