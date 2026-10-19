import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import FlowPointLogo from '@/components/FlowPointLogo';

// Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const logoVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 20, delay: 0.2 },
  },
};

const wordmarkVariants: Variants = {
  hidden: { opacity: 0, letterSpacing: '0em' },
  visible: {
    opacity: 1,
    letterSpacing: '-0.02em',
    transition: { duration: 0.8, ease: [0.25, 0, 0, 1], delay: 0.4 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 20, delay: 0.6 },
  },
};

const emailVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 150, damping: 20, delay: 0.7 } },
};

const passwordVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 150, damping: 20, delay: 0.75 } },
};

const buttonVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 150, damping: 20, delay: 0.85 } },
};

const footerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 1, ease: [0.25, 0, 0, 1], delay: 1.1 },
  },
};

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Check existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setLocation('/dashboard');
      }
    });
  }, [setLocation]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Map common errors
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials')) {
          setErrorMsg("The credentials you entered don't match our records. Please try again.");
        } else if (msg.includes('network') || msg.includes('fetch')) {
          setErrorMsg("Unable to reach FlowPoint AI servers. Check your connection.");
        } else if (msg.includes('rate limit')) {
          setErrorMsg("Too many attempts. Please wait a moment before trying again.");
        } else if (msg.includes('email not confirmed')) {
          setErrorMsg("Your account hasn't been confirmed. Check your email.");
        } else {
          setErrorMsg("Something went wrong. Please try again.");
        }
        setIsLoading(false);
      } else if (data.session) {
        setIsSuccess(true);
        setTimeout(() => {
          setLocation('/dashboard');
        }, 400); // Wait for the checkmark flash
      }
    } catch (err) {
      setErrorMsg("Unable to reach FlowPoint AI servers. Check your connection.");
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center justify-center overflow-hidden bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Background with noise and subtle breathing gradient */}
      <div className="absolute inset-0 z-0 animate-breathing-mesh" />
      <div className="bg-noise mix-blend-overlay" />

      {/* Main Content Container */}
      <motion.div
        className="relative z-10 flex flex-col items-center w-full max-w-[400px] px-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-10">
          <motion.div variants={logoVariants} className="mb-4">
            <FlowPointLogo className="w-[48px] h-[48px]" />
          </motion.div>
          <motion.h1
            variants={wordmarkVariants}
            className="text-[20px] font-medium tracking-tight text-black"
          >
            FlowPoint AI
          </motion.h1>
        </div>

        {/* Login Card */}
        <motion.div
          variants={cardVariants}
          className="w-full bg-white rounded-[20px] p-10 relative"
          style={{
            boxShadow: '0 40px 120px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          {/* Extremely subtle inner shadow via pseudo-element */}
          <div className="absolute inset-0 rounded-[20px] pointer-events-none shadow-[inset_0_1px_1px_rgba(255,255,255,1)]" />

          <form onSubmit={handleLogin} className="relative flex flex-col gap-5 w-full">
            
            {/* Email Field */}
            <motion.div variants={emailVariants} className="relative w-full">
              <label
                htmlFor="email"
                className={`absolute left-3 top-2 text-[10px] uppercase tracking-wider font-semibold pointer-events-none transition-all duration-200 ${
                  emailFocused || email ? 'text-black/60' : 'text-transparent'
                }`}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMsg('');
                }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder={emailFocused ? '' : 'Email address'}
                className={`w-full h-14 px-3 pb-1 bg-white rounded-xl text-[14px] font-medium placeholder-black/30 outline-none transition-all duration-200 border border-solid
                  ${emailFocused || email ? 'pt-5' : ''}
                  ${emailFocused ? 'border-black/40 shadow-[0_0_0_2px_rgba(0,0,0,0.04),inset_0_1px_2px_rgba(0,0,0,0.02)]' : 'border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]'}
                `}
              />
            </motion.div>

            {/* Password Field */}
            <motion.div variants={passwordVariants} className="relative w-full">
              <label
                htmlFor="password"
                className={`absolute left-3 top-2 text-[10px] uppercase tracking-wider font-semibold pointer-events-none transition-all duration-200 ${
                  passwordFocused || password ? 'text-black/60' : 'text-transparent'
                }`}
              >
                Password
              </label>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder={passwordFocused ? '' : 'Password'}
                className={`w-full h-14 pl-3 pr-10 pb-1 bg-white rounded-xl text-[14px] font-medium placeholder-black/30 outline-none transition-all duration-200 border border-solid
                  ${passwordFocused || password ? 'pt-5' : ''}
                  ${passwordFocused ? 'border-black/40 shadow-[0_0_0_2px_rgba(0,0,0,0.04),inset_0_1px_2px_rgba(0,0,0,0.02)]' : 'border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]'}
                `}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-[18px] text-black/30 hover:text-black/60 transition-colors duration-200 outline-none focus-visible:text-black/80"
              >
                {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
              </button>
            </motion.div>

            {/* Submit Button */}
            <motion.div variants={buttonVariants} className="mt-2 relative w-full">
              <button
                type="submit"
                disabled={isLoading || isSuccess}
                className="group relative w-full h-12 bg-[#0a0a0a] rounded-xl flex items-center justify-center outline-none transition-all duration-200 hover:bg-[#1a1a1a] hover:-translate-y-[2px] hover:shadow-[0_8px_20px_rgba(0,0,0,0.15)] active:translate-y-0 active:shadow-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 disabled:pointer-events-none"
              >
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                    isLoading && !isSuccess ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <svg className="animate-spin h-5 w-5 text-white/70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                    isSuccess ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <Check className="h-5 w-5 text-[#22c55e]" strokeWidth={3} />
                </div>

                <span
                  className={`text-white text-[15px] font-medium tracking-wide transition-opacity duration-300 ${
                    isLoading || isSuccess ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  Sign In
                </span>
              </button>

              {/* Error State Container */}
              <AnimatePresence>
                {errorMsg && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, y: -8 }}
                    animate={{ height: 'auto', opacity: 1, y: 0 }}
                    exit={{ height: 0, opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="overflow-hidden absolute top-full left-0 w-full pt-4"
                  >
                    <div className="bg-red-600/5 border-l border-red-600 rounded-lg px-4 py-3 text-[13px] text-red-600 font-medium leading-snug">
                      {errorMsg}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          </form>
        </motion.div>

        {/* Footer Text */}
        <motion.div variants={footerVariants} className="mt-10">
          <p className="text-[12px] text-black/30 font-medium tracking-[0.08em] uppercase">
            FlowPoint AI — Restricted Access
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
