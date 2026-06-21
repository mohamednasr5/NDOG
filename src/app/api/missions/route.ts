import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const missionProgress = await db.missionProgress.findMany()
    const missions: Record<string, unknown[]> = {
      daily: [
        { id: "daily_login", title_ar: "تسجيل الدخول اليومي", title_en: "Daily Login", reward: 10, type: "daily", autoComplete: true, action: "claim_daily" },
        { id: "share_referral", title_ar: "شارك رابط الإحالة", title_en: "Share Your Referral Link", reward: 15, type: "daily", autoComplete: false, action: "share_referral" },
        { id: "spin_wheel", title_ar: "أدر عجلة الحظ", title_en: "Spin the Wheel", reward: 5, type: "daily", autoComplete: false, action: "spin_wheel" },
        { id: "visit_whitepaper", title_ar: "اقرأ الورقة البيضاء", title_en: "Read Whitepaper", reward: 10, type: "daily", autoComplete: false, action: "visit_whitepaper" },
      ],
      weekly: [
        { id: "weekly_streak_5", title_ar: "5 أيام متتالية", title_en: "5-Day Streak", reward: 50, type: "weekly", requirement: 5, autoComplete: true, action: "check_streak" },
        { id: "weekly_streak_7", title_ar: "بطل 7 أيام", title_en: "7-Day Streak Master", reward: 100, type: "weekly", requirement: 7, autoComplete: true, action: "check_streak" },
        { id: "weekly_refer_3", title_ar: "ادعُ 3 أصدقاء", title_en: "Refer 3 Friends", reward: 75, type: "weekly", requirement: 3, autoComplete: true, action: "check_referrals" },
      ],
      monthly: [
        { id: "monthly_streak_30", title_ar: "محارب الشهر", title_en: "Monthly Warrior", reward: 500, type: "monthly", requirement: 30, autoComplete: true, action: "check_streak" },
        { id: "monthly_top_10", title_ar: "أفضل 10", title_en: "Top 10 Leaderboard", reward: 300, type: "monthly", requirement: 10, autoComplete: true, action: "check_leaderboard" },
        { id: "monthly_refer_10", title_ar: "باني المجتمع", title_en: "Community Builder", reward: 250, type: "monthly", requirement: 10, autoComplete: true, action: "check_referrals" },
      ],
    }
    return NextResponse.json({ missions })
  } catch (error) {
    console.error("Missions error:", error)
    return NextResponse.json({ error: "Failed to fetch missions" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { userId, missionId } = await req.json()
    if (!userId || !missionId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    const existing = await db.missionProgress.findFirst({
      where: { userId, missionId },
    })

    if (existing?.completed) {
      return NextResponse.json({ error: "Already completed" }, { status: 400 })
    }

    const progress = await db.missionProgress.upsert({
      where: {
        id: existing?.id || `mp_${userId}_${missionId}`,
      },
      create: {
        userId,
        missionId,
        completed: true,
        completedAt: new Date(),
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
    })

    // Give reward
    const rewards: Record<string, number> = {
      daily_login: 10, share_referral: 15, spin_wheel: 5, visit_whitepaper: 10,
      weekly_streak_5: 50, weekly_streak_7: 100, weekly_refer_3: 75,
      monthly_streak_30: 500, monthly_top_10: 300, monthly_refer_10: 250,
    }
    const reward = rewards[missionId] || 0
    if (reward > 0) {
      await db.user.update({
        where: { id: userId },
        data: { balance: { increment: reward }, totalClaimed: { increment: reward } },
      })
      await db.transaction.create({
        data: {
          userId, type: "mission_reward", amount: reward,
          description: `Mission reward: ${missionId}`,
        },
      })
    }

    return NextResponse.json({ success: true, reward, progress })
  } catch (error) {
    console.error("Mission complete error:", error)
    return NextResponse.json({ error: "Failed to complete mission" }, { status: 500 })
  }
}
