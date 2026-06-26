"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createBrowserSupabase } from "@/lib/projects/browser-supabase";
import type { ProjectComment } from "@/lib/projects/schema";

type CommentsSectionProps = {
  projectId: string;
  initialComments: ProjectComment[];
  initialSignedIn: boolean;
};

type CommentResponse = {
  comments: ProjectComment[];
};

type CommentErrorResponse = {
  error?: string;
  errors?: Record<string, string>;
};

const maxCommentLength = 1200;

export function CommentsSection({
  projectId,
  initialComments,
  initialSignedIn,
}: CommentsSectionProps) {
  const { isSignedIn } = useUser();
  const signedIn = isSignedIn ?? initialSignedIn;
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingComment, startCommentTransition] = useTransition();
  const [pendingVote, startVoteTransition] = useTransition();

  useEffect(() => {
    const supabase = createBrowserSupabase();

    if (!supabase) {
      return;
    }

    let active = true;

    async function refreshComments() {
      const response = await fetch(`/api/projects/${projectId}/comments`, {
        cache: "no-store",
      });

      if (!(active && response.ok)) {
        return;
      }

      const data = (await response.json()) as CommentResponse;
      setComments(data.comments);
    }

    const commentsChannel = supabase
      .channel(`project-comments-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_comments",
          filter: `project_id=eq.${projectId}`,
        },
        refreshComments,
      )
      .subscribe();

    const commentVotesChannel = supabase
      .channel(`project-comment-votes-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_comment_votes",
        },
        refreshComments,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(commentVotesChannel);
    };
  }, [projectId]);

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();

    if (trimmedBody.length < 3) {
      setError("Add at least 3 characters.");
      return;
    }

    if (trimmedBody.length > maxCommentLength) {
      setError("Keep comments under 1,200 characters.");
      return;
    }

    startCommentTransition(async () => {
      setError(null);
      const response = await fetch(`/api/projects/${projectId}/comments`, {
        body: JSON.stringify({ body: trimmedBody }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json()) as CommentErrorResponse;
        setError(data.errors?.body ?? data.error ?? "Could not add comment.");
        return;
      }

      const comment = (await response.json()) as ProjectComment;
      setComments((currentComments) =>
        currentComments.some(
          (currentComment) => currentComment.id === comment.id,
        )
          ? currentComments
          : [...currentComments, comment],
      );
      setBody("");
    });
  }

  function vote(commentId: string) {
    if (pendingVote) {
      return;
    }

    startVoteTransition(async () => {
      setComments((currentComments) =>
        currentComments.map((comment) => {
          if (comment.id !== commentId) {
            return comment;
          }

          const voted = !comment.voted;
          return {
            ...comment,
            voted,
            votesCount: Math.max(0, comment.votesCount + (voted ? 1 : -1)),
          };
        }),
      );

      const response = await fetch(
        `/api/projects/${projectId}/comments/${commentId}/votes`,
        { method: "POST" },
      );

      if (!response.ok) {
        const refresh = await fetch(`/api/projects/${projectId}/comments`, {
          cache: "no-store",
        });

        if (refresh.ok) {
          const data = (await refresh.json()) as CommentResponse;
          setComments(data.comments);
        }
        return;
      }

      const data = (await response.json()) as { count: number; voted: boolean };
      setComments((currentComments) =>
        currentComments.map((comment) =>
          comment.id === commentId
            ? { ...comment, votesCount: data.count, voted: data.voted }
            : comment,
        ),
      );
    });
  }

  return (
    <section className="mx-auto mt-10 max-w-6xl border border-border bg-card p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.28em] text-accent">
            Comments
          </p>
          <h2 className="mt-3 font-mono text-3xl font-black uppercase leading-none tracking-[-0.04em] sm:text-5xl">
            Build feedback
          </h2>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </p>
      </div>

      <div className="mt-8">
        {signedIn ? (
          <form className="grid gap-3" onSubmit={submitComment}>
            <Textarea
              aria-invalid={Boolean(error)}
              className="min-h-28 bg-background font-mono text-sm leading-6"
              disabled={pendingComment}
              maxLength={maxCommentLength}
              name="body"
              onChange={(event) => setBody(event.target.value)}
              placeholder="Add a useful question, note, or suggestion..."
              value={body}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {body.trim().length}/{maxCommentLength}
              </p>
              <Button
                className="h-11 px-5 text-sm uppercase tracking-[0.18em]"
                disabled={pendingComment}
                type="submit"
              >
                {pendingComment ? "Posting..." : "Post comment"}
              </Button>
            </div>
            {error ? (
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="border border-border bg-background p-5">
            <p className="font-mono text-sm uppercase leading-6 tracking-[0.14em] text-muted-foreground">
              Sign in to leave feedback and vote on comments.
            </p>
            <SignInButton mode="modal">
              <Button
                className="mt-4 h-11 px-5 text-sm uppercase tracking-[0.18em]"
                type="button"
              >
                Sign in to comment
              </Button>
            </SignInButton>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-px bg-border">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <article className="bg-background p-5" key={comment.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold uppercase tracking-[0.14em]">
                    {comment.authorName}
                  </p>
                  <p className="mt-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {comment.createdAt.slice(0, 10)}
                  </p>
                </div>
                {signedIn ? (
                  <Button
                    className="h-10 px-4 text-xs uppercase tracking-[0.16em]"
                    disabled={pendingVote}
                    onClick={() => vote(comment.id)}
                    type="button"
                    variant={comment.voted ? "default" : "outline"}
                  >
                    {comment.voted ? "Voted" : "Vote"} ({comment.votesCount})
                  </Button>
                ) : (
                  <SignInButton mode="modal">
                    <Button
                      className="h-10 px-4 text-xs uppercase tracking-[0.16em]"
                      type="button"
                      variant="outline"
                    >
                      Vote ({comment.votesCount})
                    </Button>
                  </SignInButton>
                )}
              </div>
              <p className="mt-5 whitespace-pre-wrap font-mono text-sm leading-7 text-muted-foreground">
                {comment.body}
              </p>
            </article>
          ))
        ) : (
          <div className="bg-background p-5">
            <p className="font-mono text-sm uppercase leading-6 tracking-[0.14em] text-muted-foreground">
              No comments yet. Start the thread with a sharp question or useful
              suggestion.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
