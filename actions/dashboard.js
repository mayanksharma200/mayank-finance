"use server";

import aj from "@/lib/arcjet";
import { db } from "@/lib/prisma";
import { request } from "@arcjet/next";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

// Serialize transactions safely
const serializeTransaction = (obj) => {
  if (!obj) return null;

  return {
    ...obj,
    balance: obj.balance ? obj.balance.toNumber() : undefined,
    amount: obj.amount ? obj.amount.toNumber() : undefined,
  };
};

// ✅ Get User Accounts - Handles "User Not Found" Without Crashing
export async function getUserAccounts() {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) return [];

    const accounts = await db.account.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { transactions: true } } },
    });

    return Array.isArray(accounts) ? accounts.map(serializeTransaction) : [];
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return [];
  }
}

// ✅ Create Account - Handles Invalid Data and Rate Limits
export async function createAccount(data) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const req = await request();
    const decision = await aj.protect(req, { userId, requested: 1 });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        console.error("Rate limit exceeded:", decision.reason);
        return { success: false, error: "Too many requests. Try again later." };
      }
      return { success: false, error: "Request blocked" };
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) return { success: false, error: "User not found" };

    const balanceFloat = parseFloat(data.balance);
    if (isNaN(balanceFloat)) {
      return { success: false, error: "Invalid balance amount" };
    }

    const existingAccounts = await db.account.findMany({
      where: { userId: user.id },
    });
    const shouldBeDefault =
      existingAccounts.length === 0 ? true : data.isDefault;

    if (shouldBeDefault) {
      await db.account.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await db.account.create({
      data: {
        ...data,
        balance: balanceFloat,
        userId: user.id,
        isDefault: shouldBeDefault,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, data: serializeTransaction(account) };
  } catch (error) {
    console.error("Error creating account:", error);
    return { success: false, error: "Failed to create account" };
  }
}

// ✅ Get Dashboard Data - Prevents Crashes if User is Missing
export async function getDashboardData() {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) return [];

    // Fetch transactions
    const transactions = await db.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    });

    return Array.isArray(transactions)
      ? transactions.map(serializeTransaction)
      : [];
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
}
