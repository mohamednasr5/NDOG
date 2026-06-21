import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json()
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    let user = await db.user.findUnique({ where: { email } })
    
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          name: name || email.split("@")[0],
          displayName: name || email.split("@")[0],
          founder: true,
          role: "user",
        },
      })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error("Register error:", error)
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, displayName: true, photoURL: true,
        balance: true, role: true, referralCode: true, referredBy: true,
        streak: true, lastClaimAt: true, founder: true, vipLevel: true,
        totalClaimed: true, country: true, banned: true, createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const referralCount = await db.referral.count({
      where: { referrerId: userId },
    })

    return NextResponse.json({ ...user, referralCount })
  } catch (error) {
    console.error("User fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 })
  }
}
