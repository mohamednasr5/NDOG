import { DefaultSession, DefaultUser } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      balance: number
      role: string
      referralCode: string
      founder: boolean
      vipLevel: string
      streak: number
      lastClaimAt: string | null
      totalClaimed: number
    } & DefaultSession["user"]
  }
  interface User extends DefaultUser {
    balance?: number
    role?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string
    balance: number
    role: string
    referralCode: string
    founder: boolean
    vipLevel: string
    streak: number
    lastClaimAt: string | null
    totalClaimed: number
    banned: boolean
    displayName: string
  }
}
