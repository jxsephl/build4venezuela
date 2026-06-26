"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createBrowserSupabase } from "@/lib/projects/browser-supabase";
import {
  createProjectComment,
  fetchProjectComments,
  projectQueryKeys,
  toggleProjectCommentVote,
} from "@/lib/projects/queries";
import {
  type ProjectComment,
  sortCommentsByVotes,
} from "@/lib/projects/schema";

type CommentsSectionProps = {
  projectId: string;
  initialComments: ProjectComment[];
  initialSignedIn: boolean;
};

type CommentVoteRow = {
  comment_id?: string;
  voter_id?: string;
};

type CommentVotePayload = {
  eventType: "INSERT" | "DELETE" | "UPDATE";
  new: CommentVoteRow | null;
  old: CommentVoteRow | null;
};

const maxCommentLength = 1200;
const REALTIME_INACTIVE_TIMEOUT_MS = 60_000;

function commentVoteEventKey(
  eventType: "INSERT" | "DELETE",
  commentId: string,
  voterId: string,
) {
  return `${eventType}:${commentId}:${voterId}`;
}

export function CommentsSection({
  projectId,
  initialComments,
  initialSignedIn,
}: CommentsSectionProps) {
  const { isSignedIn, user } = useUser();
  const signedIn = isSignedIn ?? initialSignedIn;
  const queryClient = useQueryClient();
  const commentsQueryKey = projectQueryKeys.comments(projectId);
  const ignoredRealtimeEventsRef = useRef(new Map<string, number>());
  const ignoredRealtimeTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>(
    [],
  );
  const { data: comments = initialComments } = useQuery({
    initialData: initialComments,
    queryFn: () => fetchProjectComments(projectId),
    queryKey: commentsQueryKey,
  });
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function ignoreNextRealtimeEvent(
    eventType: "INSERT" | "DELETE",
    commentId: string,
  ) {
    if (!user?.id) {
      return;
    }

    const key = commentVoteEventKey(eventType, commentId, user.id);
    ignoredRealtimeEventsRef.current.set(
      key,
      (ignoredRealtimeEventsRef.current.get(key) ?? 0) + 1,
    );

    const timeout = setTimeout(() => {
      const remaining = ignoredRealtimeEventsRef.current.get(key) ?? 0;

      if (remaining <= 1) {
        ignoredRealtimeEventsRef.current.delete(key);
        return;
      }

      ignoredRealtimeEventsRef.current.set(key, remaining - 1);
    }, 10_000);

    ignoredRealtimeTimeoutsRef.current.push(timeout);
  }

  const commentMutation = useMutation({
    mutationFn: (commentBody: string) =>
      createProjectComment(projectId, commentBody),
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<ProjectComment[]>(commentsQueryKey, (current) =>
        sortCommentsByVotes(
          current?.some((currentComment) => currentComment.id === comment.id)
            ? current
            : [...(current ?? []), comment],
        ),
      );
      setBody("");
    },
  });
  const commentVoteMutation = useMutation({
    mutationFn: (commentId: string) =>
      toggleProjectCommentVote(projectId, commentId),
    onError: (
      _error,
      _commentId,
      context: { previousComments?: ProjectComment[] } | undefined,
    ) => {
      if (context?.previousComments) {
        queryClient.setQueryData(commentsQueryKey, context.previousComments);
      }
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: commentsQueryKey });
      const previousComments =
        queryClient.getQueryData<ProjectComment[]>(commentsQueryKey);
      const currentComments = previousComments ?? comments;
      const currentComment = currentComments.find(
        (comment) => comment.id === commentId,
      );
      const nextVoted = !currentComment?.voted;

      ignoreNextRealtimeEvent(nextVoted ? "INSERT" : "DELETE", commentId);

      queryClient.setQueryData<ProjectComment[]>(
        commentsQueryKey,
        sortCommentsByVotes(
          currentComments.map((comment) => {
            if (comment.id !== commentId) {
              return comment;
            }

            return {
              ...comment,
              voted: nextVoted,
              votesCount: Math.max(
                0,
                comment.votesCount + (nextVoted ? 1 : -1),
              ),
            };
          }),
        ),
      );

      return { previousComments };
    },
    onSuccess: (data, commentId) => {
      queryClient.setQueryData<ProjectComment[]>(commentsQueryKey, (current) =>
        sortCommentsByVotes(
          current?.map((comment) =>
            comment.id === commentId
              ? { ...comment, votesCount: data.count, voted: data.voted }
              : comment,
          ) ?? [],
        ),
      );
    },
  });

  useEffect(() => {
    const supabase = createBrowserSupabase();

    if (!supabase) {
      return;
    }

    const realtime = supabase;
    let commentsChannel: ReturnType<typeof realtime.channel> | null = null;
    let commentVotesChannel: ReturnType<typeof realtime.channel> | null = null;
    let inactiveTimer: number | null = null;
    let hasConnected = false;

    function updateCommentVote(payload: CommentVotePayload) {
      if (payload.eventType === "UPDATE") {
        return;
      }

      const commentId = payload.new?.comment_id ?? payload.old?.comment_id;
      const voterId = payload.new?.voter_id ?? payload.old?.voter_id;

      if (!commentId) {
        return;
      }

      if (voterId) {
        const key = commentVoteEventKey(payload.eventType, commentId, voterId);
        const remaining = ignoredRealtimeEventsRef.current.get(key) ?? 0;

        if (remaining > 0) {
          if (remaining === 1) {
            ignoredRealtimeEventsRef.current.delete(key);
          } else {
            ignoredRealtimeEventsRef.current.set(key, remaining - 1);
          }

          return;
        }
      }

      const delta = payload.eventType === "INSERT" ? 1 : -1;
      const effectCommentsQueryKey = projectQueryKeys.comments(projectId);

      queryClient.setQueryData<ProjectComment[]>(
        effectCommentsQueryKey,
        (current) =>
          sortCommentsByVotes(
            current?.map((comment) =>
              comment.id === commentId
                ? {
                    ...comment,
                    voted:
                      voterId === user?.id
                        ? payload.eventType === "INSERT"
                        : comment.voted,
                    votesCount: Math.max(0, comment.votesCount + delta),
                  }
                : comment,
            ) ?? [],
          ),
      );
    }

    function disconnect() {
      if (inactiveTimer) {
        window.clearTimeout(inactiveTimer);
        inactiveTimer = null;
      }

      if (commentsChannel) {
        const currentChannel = commentsChannel;
        commentsChannel = null;
        void realtime.removeChannel(currentChannel);
      }

      if (commentVotesChannel) {
        const currentChannel = commentVotesChannel;
        commentVotesChannel = null;
        void realtime.removeChannel(currentChannel);
      }
    }

    function scheduleDisconnect() {
      if (inactiveTimer) {
        window.clearTimeout(inactiveTimer);
      }

      inactiveTimer = window.setTimeout(
        disconnect,
        REALTIME_INACTIVE_TIMEOUT_MS,
      );
    }

    function connect() {
      if (document.hidden) {
        return;
      }

      if (commentsChannel && commentVotesChannel) {
        scheduleDisconnect();
        return;
      }

      disconnect();
      const shouldReconcile = hasConnected;
      hasConnected = true;

      commentsChannel = realtime
        .channel(`project-comments-${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_comments",
            filter: `project_id=eq.${projectId}`,
          },
          () =>
            queryClient.invalidateQueries({
              queryKey: projectQueryKeys.comments(projectId),
            }),
        )
        .subscribe();

      commentVotesChannel = realtime
        .channel(`project-comment-votes-${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_comment_votes",
          },
          (payload) => updateCommentVote(payload as CommentVotePayload),
        )
        .subscribe();

      if (shouldReconcile) {
        void queryClient.invalidateQueries({
          queryKey: projectQueryKeys.comments(projectId),
        });
      }

      scheduleDisconnect();
    }

    function syncActivity() {
      connect();
    }

    function syncVisibility() {
      if (document.hidden) {
        disconnect();
        return;
      }

      connect();
    }

    connect();
    window.addEventListener("pointermove", syncActivity, { passive: true });
    window.addEventListener("pointerdown", syncActivity, { passive: true });
    window.addEventListener("scroll", syncActivity, { passive: true });
    window.addEventListener("keydown", syncActivity);
    window.addEventListener("focus", syncActivity);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      window.removeEventListener("pointermove", syncActivity);
      window.removeEventListener("pointerdown", syncActivity);
      window.removeEventListener("scroll", syncActivity);
      window.removeEventListener("keydown", syncActivity);
      window.removeEventListener("focus", syncActivity);
      document.removeEventListener("visibilitychange", syncVisibility);
      disconnect();
    };
  }, [projectId, queryClient, user?.id]);

  useEffect(
    () => () => {
      for (const timeout of ignoredRealtimeTimeoutsRef.current) {
        clearTimeout(timeout);
      }
    },
    [],
  );

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

    setError(null);
    commentMutation.mutate(trimmedBody);
  }

  function vote(commentId: string) {
    if (commentVoteMutation.isPending) {
      return;
    }

    commentVoteMutation.mutate(commentId);
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
              disabled={commentMutation.isPending}
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
                disabled={commentMutation.isPending}
                type="submit"
              >
                {commentMutation.isPending ? "Posting..." : "Post comment"}
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
                    disabled={commentVoteMutation.isPending}
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
