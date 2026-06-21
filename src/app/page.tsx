'use client'

import { useSession, signIn, signOut, getSession } from 'next-auth/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Coins, Flame, Gift, Users, Trophy, Gamepad2, TrendingUp,
  Star, Crown, ChevronLeft, ChevronRight, Globe, Moon,
  Copy, Check, ExternalLink, Zap, Shield, Target,
  Clock, ArrowUpRight, Award, RotateCw, Box, Ticket,
  Gem, Wallet, LogOut, User, Menu, X, Bell
} from 'lucide-react'

// ===== Toast Component =====
function Toast() {
  const { toast, clearToast } = useAppStore()
  if (!toast) return null
  const bgColor = toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] ${bgColor} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-300`}>
      <span className="text-sm font-medium">{toast.message}</span>
      <button onClick={clearToast} className="text-white/80 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ===== Language Context =====
const t = (key: string) => {
  const lang = useAppStore.getState().lang
  const translations: Record<string, Record<string, string>> = {
    app_name: { ar: 'نايل دوجز', en: 'NileDogs' },
    dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
    missions: { ar: 'المهام', en: 'Missions' },
    games: { ar: 'الألعاب', en: 'Games' },
    staking: { ar: 'التخزين', en: 'Staking' },
    leaderboard: { ar: 'المتصدرين', en: 'Leaderboard' },
    referral: { ar: 'الإحالة', en: 'Referral' },
    airdrop: { ar: 'الأيردروب', en: 'Airdrop' },
    news: { ar: 'الأخبار', en: 'News' },
    faq: { ar: 'الأسئلة الشائعة', en: 'FAQ' },
    daily_claim: { ar: 'المكافأة اليومية', en: 'Daily Claim' },
    claim_now: { ar: 'اطلب الآن', en: 'Claim Now' },
    next_claim: { ar: 'المطالبة التالية', en: 'Next Claim' },
    hours: { ar: 'ساعة', en: 'hours' },
    balance: { ar: 'الرصيد', en: 'Balance' },
    streak: { ar: 'السلسلة', en: 'Streak' },
    days: { ar: 'يوم', en: 'days' },
    founder_badge: { ar: 'عضو مؤسس', en: 'Founding Member' },
    vip_level: { ar: 'مستوى VIP', en: 'VIP Level' },
    total_claimed: { ar: 'إجمالي المكاسب', en: 'Total Claimed' },
    login_google: { ar: 'تسجيل الدخول بـ Google', en: 'Sign in with Google' },
    login_demo: { ar: 'دخول تجريبي', en: 'Demo Login' },
    email: { ar: 'البريد الإلكتروني', en: 'Email' },
    name: { ar: 'الاسم', en: 'Name' },
    login: { ar: 'دخول', en: 'Login' },
    logout: { ar: 'خروج', en: 'Logout' },
    welcome: { ar: 'مرحباً', en: 'Welcome' },
    spin_wheel: { ar: 'عجلة الحظ', en: 'Spin the Wheel' },
    lucky_box: { ar: 'الصندوق المحظوظ', en: 'Lucky Box' },
    scratch_card: { ar: 'بطاقة الخدش', en: 'Scratch Card' },
    play: { ar: 'العب', en: 'Play' },
    cooldown: { ar: 'وقت الانتظار', en: 'Cooldown' },
    stake_tokens: { ar: 'خزّن توكناتك', en: 'Stake Your Tokens' },
    stake: { ar: 'تخزين', en: 'Stake' },
    unstake: { ar: 'استرداد', en: 'Unstake' },
    active_contracts: { ar: 'العقود النشطة', en: 'Active Contracts' },
    earned: { ar: 'المربح', en: 'Earned' },
    apr: { ar: 'APR', en: 'APR' },
    duration: { ar: 'المدة', en: 'Duration' },
    min_stake: { ar: 'الحد الأدنى', en: 'Min Stake' },
    top_balance: { ar: 'أعلى رصيد', en: 'Top Balance' },
    top_streak: { ar: 'أطول سلسلة', en: 'Top Streak' },
    top_referrals: { ar: 'أكثر إحالة', en: 'Top Referrals' },
    rank: { ar: 'الترتيب', en: 'Rank' },
    your_code: { ar: 'كود الإحالة', en: 'Your Code' },
    share_link: { ar: 'شارك الرابط', en: 'Share Link' },
    referrals_count: { ar: 'عدد الإحالات', en: 'Referrals' },
    l1_bonus: { ar: 'مكافأة L1', en: 'L1 Bonus' },
    l2_bonus: { ar: 'مكافأة L2', en: 'L2 Bonus' },
    l3_bonus: { ar: 'مكافأة L3', en: 'L3 Bonus' },
    enter_referral: { ar: 'أدخل كود الإحالة', en: 'Enter Referral Code' },
    apply: { ar: 'تطبيق', en: 'Apply' },
    airdrop_info: { ar: 'معلومات الأيردروب', en: 'Airdrop Info' },
    total_pool: { ar: 'إجمالي الجائزة', en: 'Total Pool' },
    criteria: { ar: 'المعايير', en: 'Criteria' },
    min_balance: { ar: 'حد أدنى للرصيد', en: 'Min Balance' },
    min_claims: { ar: 'حد أدنى للمطالبات', en: 'Min Claims' },
    profile: { ar: 'الملف الشخصي', en: 'Profile' },
    copied: { ar: 'تم النسخ!', en: 'Copied!' },
    multiplier: { ar: 'المضاعف', en: 'Multiplier' },
    reward: { ar: 'المكافأة', en: 'Reward' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    in_progress: { ar: 'جاري', en: 'In Progress' },
    daily: { ar: 'يومي', en: 'Daily' },
    weekly: { ar: 'أسبوعي', en: 'Weekly' },
    monthly: { ar: 'شهري', en: 'Monthly' },
    bronze: { ar: 'برونزي', en: 'Bronze' },
    silver: { ar: 'فضي', en: 'Silver' },
    gold: { ar: 'ذهبي', en: 'Gold' },
    platinum: { ar: 'بلاتيني', en: 'Platinum' },
    diamond: { ar: 'ماسي', en: 'Diamond' },
    tokenomics: { ar: 'اقتصاد التوكن', en: 'Tokenomics' },
    total_supply: { ar: 'الإمداد الكلي', en: 'Total Supply' },
    community: { ar: 'المجتمع', en: 'Community' },
    team: { ar: 'الفريق', en: 'Team' },
    liquidity: { ar: 'السيولة', en: 'Liquidity' },
    partnerships: { ar: 'الشراكات', en: 'Partnerships' },
    reserve: { ar: 'الاحتياطي', en: 'Reserve' },
  }
  return translations[key]?.[lang] || key
}

// ===== VIP Badge Component =====
function VipBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    bronze: 'bg-orange-700/50 text-orange-300 border-orange-600',
    silver: 'bg-gray-500/50 text-gray-200 border-gray-400',
    gold: 'bg-yellow-600/50 text-yellow-200 border-yellow-500',
    platinum: 'bg-cyan-600/50 text-cyan-200 border-cyan-500',
    diamond: 'bg-purple-600/50 text-purple-200 border-purple-500',
  }
  return (
    <Badge className={`${colors[level] || colors.bronze} border px-3 py-1 text-xs font-bold`}>
      <Crown className="w-3 h-3 mr-1" />
      {t(level)}
    </Badge>
  )
}

// ===== Login Screen =====
function LoginScreen() {
  const { lang, setLang } = useAppStore()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const { lang: currentLang } = useAppStore()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    try {
      await signIn('credentials', {
        email,
        name: name || email.split('@')[0],
        redirect: false,
      })
    } catch {
      // error handled by next-auth
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    // In production, this would use Google OAuth
    // For demo, simulate with a Google-like email
    const demoEmail = `user${Date.now()}@gmail.com`
    setLoading(true)
    try {
      await signIn('credentials', {
        email: demoEmail,
        name: 'Google User',
        redirect: false,
      })
    } catch {
      // error
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🐕</div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 bg-clip-text text-transparent">
            NileDogs
          </h1>
          <p className="text-sm text-slate-400 mt-2">NDOG - Community Rewards Platform</p>
        </div>

        {/* Language Toggle */}
        <div className="flex justify-center mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(currentLang === 'ar' ? 'en' : 'ar')}
            className="text-slate-400 hover:text-white"
          >
            <Globe className="w-4 h-4" />
            <span className="mx-2">{currentLang === 'ar' ? 'English' : 'العربية'}</span>
          </Button>
        </div>

        <Card className="bg-slate-900/80 border-slate-700/50 backdrop-blur-xl shadow-2xl">
          <CardContent className="p-6 space-y-4">
            {/* Google Login Button */}
            <Button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full h-14 text-base bg-white text-black hover:bg-gray-100 font-medium rounded-xl active:scale-[0.98] transition-transform"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {t('login_google')}
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1 bg-slate-700" />
              <span className="text-xs text-slate-500">أو OR</span>
              <Separator className="flex-1 bg-slate-700" />
            </div>

            {/* Demo Login Form */}
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">{t('email')}</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">{t('name')}</label>
                <Input
                  type="text"
                  placeholder={currentLang === 'ar' ? 'اسمك' : 'Your name'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-base"
              >
                {loading ? (
                  <RotateCw className="w-5 h-5 animate-spin" />
                ) : (
                  t('login')
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-slate-500 mt-4">
              {currentLang === 'ar'
                ? 'بالانضمام أنت توافق على شروط الاستخدام وسياسة الخصوصية'
                : 'By joining you agree to the Terms of Service and Privacy Policy'}
            </p>
          </CardContent>
        </Card>

        {/* Tokenomics Preview */}
        <Card className="mt-6 bg-slate-900/50 border-slate-700/30">
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400">{t('total_supply')}</span>
              <span className="text-sm font-bold text-amber-400">1,000,000,000 NDOG</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[
                { pct: 60, color: 'bg-amber-500', label: t('community') },
                { pct: 15, color: 'bg-purple-500', label: t('team') },
                { pct: 10, color: 'bg-blue-500', label: t('liquidity') },
                { pct: 10, color: 'bg-green-500', label: t('partnerships') },
                { pct: 5, color: 'bg-gray-500', label: t('reserve') },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className={`h-2 rounded-full ${item.color} mb-1`} style={{ width: '100%' }} />
                  <span className="text-[10px] text-slate-500">{item.pct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ===== Dashboard Tab =====
function DashboardTab({ session }: { session: any }) {
  const { lang, showToast } = useAppStore()
  const [claiming, setClaiming] = useState(false)
  const [canClaim, setCanClaim] = useState(true)
  const [hoursLeft, setHoursLeft] = useState(0)
  const [lastReward, setLastReward] = useState<number | null>(null)
  const spinRef = useRef<HTMLDivElement>(null)
  const [spinning, setSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState<number | null>(null)

  const user = session?.user
  const lastClaim = user?.lastClaimAt ? new Date(user.lastClaimAt) : null
  const isRTL = lang === 'ar'

  useEffect(() => {
    if (lastClaim) {
      const now = new Date()
      const elapsed = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60)
      if (elapsed < 24) {
        setCanClaim(false)
        setHoursLeft(Math.ceil(24 - elapsed))
        const interval = setInterval(() => {
          const now2 = new Date()
          const elapsed2 = (now2.getTime() - lastClaim.getTime()) / (1000 * 60 * 60)
          if (elapsed2 >= 24) {
            setCanClaim(true)
            setHoursLeft(0)
            clearInterval(interval)
          } else {
            setHoursLeft(Math.ceil(24 - elapsed2))
          }
        }, 60000)
        return () => clearInterval(interval)
      }
    }
  }, [lastClaim])

  const handleClaim = async () => {
    if (!user?.id) return
    setClaiming(true)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setLastReward(data.reward)
        showToast(`${lang === 'ar' ? 'تم الحصول على' : 'Claimed'} ${data.reward} NDOG!`, 'success')
        // Refresh session
        await fetch('/api/auth/session?update=1')
      } else {
        showToast(data.error || 'Claim failed', 'error')
        if (data.nextClaimAt) {
          setCanClaim(false)
        }
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setClaiming(false)
    }
  }

  const handleSpin = async () => {
    if (!user?.id || spinning) return
    setSpinning(true)
    setSpinResult(null)
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, gameType: 'spin_wheel' }),
      })
      const data = await res.json()
      if (res.ok) {
        setSpinResult(data.prize)
        showToast(`${lang === 'ar' ? 'فزت بـ' : 'You won'} ${data.prize} NDOG!`, 'success')
        await fetch('/api/auth/session?update=1')
      } else {
        showToast(data.error || 'Spin failed', 'error')
        setSpinning(false)
      }
    } catch {
      showToast('Network error', 'error')
      setSpinning(false)
    }
  }

  const prizes = [5, 10, 15, 20, 25, 50, 75, 100]
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b']

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-amber-500/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5" />
        <CardContent className="p-6 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">{t('balance')}</p>
              <p className="text-4xl font-bold text-amber-400 mt-1">
                {user?.balance?.toLocaleString() || 0}
                <span className="text-lg ml-1">NDOG</span>
              </p>
              <div className="flex items-center gap-2 mt-2">
                <VipBadge level={user?.vipLevel || 'bronze'} />
                {user?.founder && (
                  <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50 border">
                    <Star className="w-3 h-3 mr-1" />
                    {t('founder_badge')}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-6xl">🐕</div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-slate-900/80 border-slate-700/30">
          <CardContent className="p-4 text-center">
            <Flame className="w-6 h-6 text-orange-400 mx-auto mb-1" />
            <p className="text-2xl font-bold">{user?.streak || 0}</p>
            <p className="text-xs text-slate-400">{t('streak')} ({t('days')})</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/80 border-slate-700/30">
          <CardContent className="p-4 text-center">
            <Coins className="w-6 h-6 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold">{user?.totalClaimed?.toLocaleString() || 0}</p>
            <p className="text-xs text-slate-400">{t('total_claimed')}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/80 border-slate-700/30">
          <CardContent className="p-4 text-center">
            <Target className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
            <p className="text-2xl font-bold">1.5x</p>
            <p className="text-xs text-slate-400">{t('multiplier')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Claim */}
      <Card className="bg-slate-900/80 border-slate-700/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Gift className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold">{t('daily_claim')}</h3>
                <p className="text-xs text-slate-400">10 NDOG + bonuses</p>
              </div>
            </div>
            {canClaim ? (
              <Button
                onClick={handleClaim}
                disabled={claiming}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-6"
              >
                {claiming ? <RotateCw className="w-5 h-5 animate-spin" /> : t('claim_now')}
              </Button>
            ) : (
              <div className="text-center">
                <p className="text-sm text-slate-400">{t('next_claim')}</p>
                <p className="text-lg font-bold text-orange-400">{hoursLeft} {t('hours')}</p>
              </div>
            )}
          </div>
          {lastReward && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mt-3">
              <p className="text-sm text-emerald-400">+{lastReward} NDOG {lang === 'ar' ? 'تمت إضافتها!' : 'added!'}</p>
            </div>
          )}
          {/* Streak Progress */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{t('streak')}: {user?.streak || 0} {t('days')}</span>
              <span>Next bonus: 7 days (2x)</span>
            </div>
            <Progress value={Math.min(((user?.streak || 0) / 7) * 100, 100)} className="h-2 bg-slate-800" />
          </div>
        </CardContent>
      </Card>

      {/* Spin Wheel */}
      <Card className="bg-slate-900/80 border-slate-700/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <RotateCw className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-bold text-lg">{t('spin_wheel')}</h3>
          </div>
          
          <div className="flex justify-center mb-4">
            <div
              ref={spinRef}
              className="w-48 h-48 sm:w-56 sm:h-56 rounded-full border-4 border-amber-500/50 relative overflow-hidden"
              style={{
                background: `conic-gradient(${colors.map((c, i) => `${c} ${(i * 360) / prizes.length}deg ${(i + 1) * 360 / prizes.length}deg`).join(', ')})`,
                transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                transform: spinning ? `rotate(${(spinResult !== null ? (prizes.indexOf(spinResult) * 45) + 1440 : 0)}deg)` : 'rotate(0deg)',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-amber-500 flex items-center justify-center">
                  {spinResult !== null ? (
                    <span className="text-lg font-bold text-amber-400">{spinResult}</span>
                  ) : (
                    <span className="text-2xl">🪙</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSpin}
            disabled={spinning}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold h-12"
          >
            {spinning ? (
              <RotateCw className="w-5 h-5 animate-spin" />
            ) : (
              t('play')
            )}
          </Button>
          {spinResult !== null && !spinning && (
            <p className="text-center mt-2 text-amber-400 font-medium">
              {lang === 'ar' ? 'فزت بـ' : 'You won'} {spinResult} NDOG!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick Games */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-slate-900/80 border-slate-700/30">
          <CardContent className="p-4 text-center cursor-pointer hover:border-emerald-500/50 transition-colors">
            <Box className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <h4 className="font-bold text-sm">{t('lucky_box')}</h4>
            <p className="text-xs text-slate-400 mt-1">5-100 NDOG</p>
            <QuickGame userId={user?.id} gameType="lucky_box" />
          </CardContent>
        </Card>
        <Card className="bg-slate-900/80 border-slate-700/30">
          <CardContent className="p-4 text-center cursor-pointer hover:border-blue-500/50 transition-colors">
            <Ticket className="w-10 h-10 text-blue-400 mx-auto mb-2" />
            <h4 className="font-bold text-sm">{t('scratch_card')}</h4>
            <p className="text-xs text-slate-400 mt-1">5-200 NDOG</p>
            <QuickGame userId={user?.id} gameType="scratch_card" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function QuickGame({ userId, gameType }: { userId?: string; gameType: string }) {
  const { lang, showToast } = useAppStore()
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<number | null>(null)

  const handlePlay = async () => {
    if (!userId || playing) return
    setPlaying(true)
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, gameType }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data.prize)
        showToast(`+${data.prize} NDOG!`, 'success')
        await fetch('/api/auth/session?update=1')
      } else {
        showToast(data.error || 'Failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setPlaying(false)
    }
  }

  return (
    <Button
      onClick={handlePlay}
      disabled={playing}
      size="sm"
      variant={result !== null ? "default" : "outline"}
      className={`mt-2 w-full text-xs ${result !== null ? 'bg-emerald-600' : 'border-slate-600 text-slate-300'}`}
    >
      {playing ? <RotateCw className="w-3 h-3 animate-spin" /> : result !== null ? `+${result}` : t('play')}
    </Button>
  )
}

// ===== Missions Tab =====
function MissionsTab({ session }: { session: any }) {
  const { lang, showToast } = useAppStore()
  const [missions, setMissions] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)
  const user = session?.user

  useEffect(() => {
    fetch('/api/missions').then(r => r.json()).then(data => {
      setMissions(data.missions || {})
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const completeMission = async (missionId: string) => {
    if (!user?.id || completing) return
    setCompleting(missionId)
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, missionId }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`+${data.reward} NDOG!`, 'success')
        await fetch('/api/auth/session?update=1')
      } else {
        showToast(data.error || 'Failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setCompleting(null)
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-20 w-full bg-slate-800" /><Skeleton className="h-20 w-full bg-slate-800" /><Skeleton className="h-20 w-full bg-slate-800" /></div>
  }

  return (
    <div className="space-y-4">
      {Object.entries(missions).map(([type, items]) => (
        <Card key={type} className="bg-slate-900/80 border-slate-700/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {type === 'daily' ? <Clock className="w-5 h-5 text-blue-400" /> :
               type === 'weekly' ? <CalendarDays className="w-5 h-5 text-purple-400" /> :
               <Star className="w-5 h-5 text-amber-400" />}
              {t(type)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(items || []).map((mission: any) => (
              <div key={mission.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                <div>
                  <p className="font-medium text-sm">{lang === 'ar' ? mission.title_ar : mission.title_en}</p>
                  <p className="text-xs text-amber-400 mt-1">+{mission.reward} NDOG</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => completeMission(mission.id)}
                  disabled={completing === mission.id}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {completing === mission.id ? <RotateCw className="w-4 h-4 animate-spin" /> : mission.autoComplete ? t('claim_now') : t('completed')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// CalendarDays icon fallback
function CalendarDays(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m16 14-2 2 2 2"/><path d="M8 14h.01"/>
    </svg>
  )
}

// ===== Staking Tab =====
function StakingTab({ session }: { session: any }) {
  const { lang, showToast } = useAppStore()
  const user = session?.user
  const [amount, setAmount] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('7_days')
  const [staking, setStaking] = useState(false)
  const [contracts, setContracts] = useState<any[]>([])

  const plans = [
    { id: '7_days', apr: 5, days: 7, min: 100, color: 'from-emerald-500 to-green-500' },
    { id: '30_days', apr: 10, days: 30, min: 500, color: 'from-blue-500 to-cyan-500' },
    { id: '90_days', apr: 18, days: 90, min: 1000, color: 'from-purple-500 to-violet-500' },
    { id: '180_days', apr: 25, days: 180, min: 2000, color: 'from-amber-500 to-orange-500' },
  ]

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/staking?userId=${user.id}`).then(r => r.json()).then(data => {
        setContracts(data.contracts || [])
      }).catch(() => {})
    }
  }, [user?.id])

  const handleStake = async () => {
    if (!user?.id || !amount || !selectedPlan) return
    setStaking(true)
    try {
      const res = await fetch('/api/staking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, planId: selectedPlan, amount: parseFloat(amount) }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`${lang === 'ar' ? 'تم التخزين بنجاح!' : 'Staked successfully!'}`, 'success')
        setAmount('')
        await fetch('/api/auth/session?update=1')
        // Refresh contracts
        const updated = await fetch(`/api/staking?userId=${user.id}`).then(r => r.json())
        setContracts(updated.contracts || [])
      } else {
        showToast(data.error || 'Staking failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setStaking(false)
    }
  }

  const handleUnstake = async (contractId: string) => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/staking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, action: 'claim' }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`${lang === 'ar' ? 'تم الاسترداد' : 'Unstaked'}: ${data.totalReturn} NDOG`, 'success')
        await fetch('/api/auth/session?update=1')
        const updated = await fetch(`/api/staking?userId=${user.id}`).then(r => r.json())
        setContracts(updated.contracts || [])
      } else {
        showToast(data.error || 'Unstake failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/80 border-slate-700/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gem className="w-5 h-5 text-amber-400" />
            {t('stake_tokens')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">{lang === 'ar' ? 'رصيدك المتاح' : 'Available balance'}: <span className="text-amber-400 font-bold">{user?.balance?.toLocaleString() || 0} NDOG</span></p>

          {/* Plan Selection */}
          <div className="grid grid-cols-2 gap-2">
            {plans.map(plan => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPlan === plan.id
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <p className="font-bold text-sm">{plan.days} {t('days')}</p>
                <p className="text-amber-400 font-bold">{plan.apr}% APR</p>
                <p className="text-xs text-slate-400">{t('min_stake')}: {plan.min}</p>
              </button>
            ))}
          </div>

          <Input
            type="number"
            placeholder={lang === 'ar' ? 'أدخل الكمية' : 'Enter amount'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-slate-800/50 border-slate-600 text-white"
          />

          <Button
            onClick={handleStake}
            disabled={staking || !amount}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold h-12"
          >
            {staking ? <RotateCw className="w-5 h-5 animate-spin" /> : t('stake')}
          </Button>
        </CardContent>
      </Card>

      {/* Active Contracts */}
      {contracts.length > 0 && (
        <Card className="bg-slate-900/80 border-slate-700/30">
          <CardHeader>
            <CardTitle className="text-base">{t('active_contracts')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contracts.filter((c: any) => c.status === 'active').map((contract: any) => {
              const plan = plans.find(p => p.id === contract.planId)
              const isMatured = new Date() >= new Date(contract.endDate)
              return (
                <div key={contract.id} className="p-3 rounded-lg bg-slate-800/50">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{plan?.days} {t('days')} - {plan?.apr}%</p>
                      <p className="text-sm text-slate-400">{contract.amount} NDOG</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleUnstake(contract.id)}
                      disabled={!isMatured}
                      className={isMatured ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700'}
                    >
                      {isMatured ? t('unstake') : `${Math.ceil((new Date(contract.endDate).getTime() - Date.now()) / (1000*60*60*24))}d`}
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===== Leaderboard Tab =====
function LeaderboardTab() {
  const { lang } = useAppStore()
  const [data, setData] = useState<{ topBalance: any[]; topStreak: any[]; topReferrals: any[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.json()).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return <div className="space-y-3"><Skeleton className="h-60 w-full bg-slate-800" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Top Balance */}
      <Card className="bg-slate-900/80 border-slate-700/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            {t('top_balance')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.topBalance.slice(0, 10).map((u: any) => (
              <div key={u.id} className={`flex items-center justify-between p-3 rounded-lg ${u.rank <= 3 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-800/50'}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${u.rank === 1 ? 'bg-yellow-500 text-black' : u.rank === 2 ? 'bg-gray-400 text-black' : u.rank === 3 ? 'bg-amber-700 text-white' : 'bg-slate-700 text-slate-300'}`}>
                    {u.rank}
                  </span>
                  <div>
                    <p className="font-medium text-sm">{u.displayName || u.name}</p>
                  </div>
                </div>
                <span className="font-bold text-amber-400">{u.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Streak */}
      <Card className="bg-slate-900/80 border-slate-700/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            {t('top_streak')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.topStreak.slice(0, 5).map((u: any) => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${u.rank === 1 ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                    {u.rank}
                  </span>
                  <p className="font-medium text-sm">{u.displayName || u.name}</p>
                </div>
                <span className="font-bold text-orange-400">{u.streak} {t('days')}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ===== Referral Tab =====
function ReferralTab({ session }: { session: any }) {
  const { lang, showToast } = useAppStore()
  const user = session?.user
  const [referralCode, setReferralCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [referralCount, setReferralCount] = useState(0)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/referral?userId=${user.id}`).then(r => r.json()).then(data => {
        setReferralCount(Array.isArray(data) ? data.length : 0)
      }).catch(() => {})
    }
  }, [user?.id])

  const copyCode = () => {
    if (user?.referralCode) {
      navigator.clipboard.writeText(user.referralCode)
      setCopied(true)
      showToast(t('copied'), 'success')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const applyReferral = async () => {
    if (!user?.id || !referralCode) return
    setApplying(true)
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referrerCode: referralCode, newUserId: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(lang === 'ar' ? 'تم تطبيق كود الإحالة! +50 NDOG للمحيل' : 'Referral code applied! +50 NDOG to referrer', 'success')
        setReferralCode('')
        await fetch('/api/auth/session?update=1')
      } else {
        showToast(data.error || 'Failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Referral Code Card */}
      <Card className="bg-gradient-to-br from-slate-900/90 to-purple-900/30 border-purple-500/20">
        <CardContent className="p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            {t('referral')}
          </h3>
          <div className="text-center mb-4">
            <p className="text-sm text-slate-400 mb-2">{t('your_code')}</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-xl font-mono font-bold text-amber-400 bg-slate-800/50 px-4 py-2 rounded-lg">
                {user?.referralCode?.slice(0, 8).toUpperCase() || '---'}
              </code>
              <Button size="icon" variant="ghost" onClick={copyCode} className="text-slate-400 hover:text-white">
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Tiers */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center p-2 rounded-lg bg-slate-800/50">
              <p className="text-xs text-slate-400">L1</p>
              <p className="font-bold text-amber-400">+50</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-slate-800/50">
              <p className="text-xs text-slate-400">L2</p>
              <p className="font-bold text-amber-400">+20</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-slate-800/50">
              <p className="text-xs text-slate-400">L3</p>
              <p className="font-bold text-amber-400">+10</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30">
            <span className="text-sm text-slate-400">{t('referrals_count')}</span>
            <span className="font-bold text-lg">{referralCount}</span>
          </div>
        </CardContent>
      </Card>

      {/* Apply Referral Code */}
      <Card className="bg-slate-900/80 border-slate-700/30">
        <CardContent className="p-6">
          <h4 className="font-medium mb-3">{t('enter_referral')}</h4>
          <div className="flex gap-2">
            <Input
              placeholder="CODE"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className="bg-slate-800/50 border-slate-600 text-white flex-1"
            />
            <Button onClick={applyReferral} disabled={applying || !referralCode} className="bg-emerald-600 hover:bg-emerald-700 px-6">
              {applying ? <RotateCw className="w-5 h-5 animate-spin" /> : t('apply')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ===== Airdrop Tab =====
function AirdropTab() {
  const { lang } = useAppStore()
  const [airdrop, setAirdrop] = useState<any>(null)

  useEffect(() => {
    fetch('/api/airdrop').then(r => r.json()).then(setAirdrop).catch(() => {})
  }, [])

  if (!airdrop) return <Skeleton className="h-60 w-full bg-slate-800" />

  return (
    <Card className="bg-gradient-to-br from-slate-900/90 to-amber-900/20 border-amber-500/20">
      <CardContent className="p-6 space-y-4">
        <div className="text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            {lang === 'ar' ? airdrop.rounds?.round_1?.name_ar : airdrop.rounds?.round_1?.name_en}
          </h2>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-400">{t('total_pool')}</span>
            <span className="font-bold text-amber-400">{airdrop.rounds?.round_1?.totalPool?.toLocaleString()} NDOG</span>
          </div>
          <Separator className="bg-slate-700" />
          <div className="flex justify-between">
            <span className="text-slate-400">{t('min_balance')}</span>
            <span className="font-bold">{airdrop.rounds?.round_1?.criteria?.minBalance} NDOG</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">{t('min_claims')}</span>
            <span className="font-bold">{airdrop.rounds?.round_1?.criteria?.minClaims}</span>
          </div>
        </div>

        <div className="text-center text-sm text-slate-400">
          {lang === 'ar' ? 'استمر في المطالبة اليومية واربح لتأهيلك للأيردروب!' : 'Keep claiming daily and earn to qualify for the airdrop!'}
        </div>
      </CardContent>
    </Card>
  )
}

// ===== News Tab =====
function NewsTab() {
  const { lang } = useAppStore()
  const [news, setNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/news').then(r => r.json()).then(data => {
      setNews(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-3"><Skeleton className="h-30 w-full bg-slate-800" /><Skeleton className="h-30 w-full bg-slate-800" /></div>

  return (
    <div className="space-y-4">
      {news.map((item: any) => (
        <Card key={item.id} className={`bg-slate-900/80 ${item.featured ? 'border-amber-500/30' : 'border-slate-700/30'}`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">{item.category}</Badge>
              {item.featured && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/50 border text-xs">
                <Star className="w-3 h-3 mr-1" /> {lang === 'ar' ? 'مميز' : 'Featured'}
              </Badge>}
            </div>
            <h3 className="font-bold text-lg mb-2">{lang === 'ar' ? item.titleAr : item.titleEn}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{lang === 'ar' ? item.contentAr : item.contentEn}</p>
            <p className="text-xs text-slate-500 mt-3">{item.author} • {new Date(item.publishedAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ===== FAQ Tab =====
function FaqTab() {
  const { lang } = useAppStore()
  const [faqs, setFaqs] = useState<any[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/faq').then(r => r.json()).then(data => {
      setFaqs(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-3"><Skeleton className="h-16 w-full bg-slate-800" /><Skeleton className="h-16 w-full bg-slate-800" /></div>

  return (
    <div className="space-y-2">
      {faqs.map((faq: any, i: number) => (
        <Card key={faq.id} className="bg-slate-900/80 border-slate-700/30 overflow-hidden">
          <button
            className="w-full text-right p-4 flex items-center justify-between"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <span className="font-medium text-sm">{lang === 'ar' ? faq.questionAr : faq.questionEn}</span>
            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${openIndex === i ? 'rotate-90' : ''}`} />
          </button>
          {openIndex === i && (
            <div className="px-4 pb-4 text-sm text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
              {lang === 'ar' ? faq.answerAr : faq.answerEn}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

// ===== Main App =====
export default function Home() {
  const { data: session, status } = useSession()
  const { lang, setLang, activeTab, setActiveTab, showToast } = useAppStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  // Show login screen if not authenticated
  if (status === 'unauthenticated') {
    return <LoginScreen />
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RotateCw className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    )
  }

  const user = session?.user
  const tabs = [
    { id: 'dashboard', icon: Wallet, label: t('dashboard') },
    { id: 'missions', icon: Target, label: t('missions') },
    { id: 'games', icon: Gamepad2, label: t('games') },
    { id: 'staking', icon: TrendingUp, label: t('staking') },
    { id: 'leaderboard', icon: Trophy, label: t('leaderboard') },
    { id: 'referral', icon: Users, label: t('referral') },
    { id: 'airdrop', icon: Gift, label: t('airdrop') },
    { id: 'news', icon: Bell, label: t('news') },
    { id: 'faq', icon: Shield, label: t('faq') },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Toast />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐕</span>
            <div>
              <h1 className="font-bold text-base text-amber-400">NileDogs</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5">NDOG v2.0</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="text-slate-400 hover:text-white h-9 px-2"
            >
              <Globe className="w-4 h-4" />
            </Button>

            {/* User Info */}
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user?.name || user?.email}</p>
                <p className="text-xs text-amber-400">{user?.balance?.toLocaleString() || 0} NDOG</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-slate-400 hover:text-red-400 h-9 px-2"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Bottom Navigation - Mobile Optimized */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/50 safe-area-bottom">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-stretch justify-around px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {tabs.slice(0, 5).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors active:scale-95 ${
                  activeTab === tab.id ? 'text-amber-400' : 'text-slate-500'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-4 pt-3 sm:pt-4 pb-28 sm:pb-24">
        {/* Tab pills for remaining tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap text-xs h-8 ${
                activeTab === tab.id
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5 mr-1" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'dashboard' && <DashboardTab session={session} />}
        {activeTab === 'missions' && <MissionsTab session={session} />}
        {activeTab === 'games' && <DashboardTab session={session} />}
        {activeTab === 'staking' && <StakingTab session={session} />}
        {activeTab === 'leaderboard' && <LeaderboardTab />}
        {activeTab === 'referral' && <ReferralTab session={session} />}
        {activeTab === 'airdrop' && <AirdropTab />}
        {activeTab === 'news' && <NewsTab />}
        {activeTab === 'faq' && <FaqTab />}
      </main>
    </div>
  )
}
