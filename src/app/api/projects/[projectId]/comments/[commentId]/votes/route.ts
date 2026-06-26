import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getCommentVoteCount,
  hasCommentVoted,
  toggleCommentVote,
} from "@/lib/projects/store";

type Props = {
  params: Promise<{ commentId: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { commentId } = await params;
  const { userId } = await auth();

  return NextResponse.json({
    count: await getCommentVoteCount(commentId),
    voted: await hasCommentVoted(commentId, userId ?? undefined),
  });
}

export async function POST(_request: Request, { params }: Props) {
  const { commentId } = await params;
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  }

  return NextResponse.json(await toggleCommentVote(commentId, userId));
}
