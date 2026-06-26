"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/projects/browser-supabase";
import {
  fetchProjectVote,
  projectQueryKeys,
  toggleProjectVote,
} from "@/lib/projects/queries";

type VoteButtonProps = {
  projectId: string;
  initialCount: number;
  initialSignedIn: boolean;
  initialVoted: boolean;
};

type VoteState = {
  count: number;
  voted: boolean;
};

type ProjectVoteRow = {
  project_id?: string;
  voter_id?: string;
};

type ProjectVotePayload = {
  eventType: "INSERT" | "DELETE" | "UPDATE";
  new: ProjectVoteRow | null;
  old: ProjectVoteRow | null;
};

const REALTIME_INACTIVE_TIMEOUT_MS = 60_000;

function realtimeEventKey(
  eventType: "INSERT" | "DELETE",
  projectId: string,
  voterId: string,
) {
  return `${eventType}:${projectId}:${voterId}`;
}

export function VoteButton({
  projectId,
  initialCount,
  initialSignedIn,
  initialVoted,
}: VoteButtonProps) {
  const { isSignedIn, user } = useUser();
  const queryClient = useQueryClient();
  const voteQueryKey = projectQueryKeys.votes(projectId);
  const ignoredRealtimeEventsRef = useRef(new Map<string, number>());
  const ignoredRealtimeTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>(
    [],
  );
  const { data: voteState = { count: initialCount, voted: initialVoted } } =
    useQuery({
      initialData: { count: initialCount, voted: initialVoted },
      queryFn: () => fetchProjectVote(projectId),
      queryKey: voteQueryKey,
    });

  function ignoreNextRealtimeEvent(eventType: "INSERT" | "DELETE") {
    if (!user?.id) {
      return;
    }

    const key = realtimeEventKey(eventType, projectId, user.id);
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

  const voteMutation = useMutation({
    mutationFn: () => toggleProjectVote(projectId),
    onError: (
      _error,
      _variables,
      context: { previousVote?: VoteState } | undefined,
    ) => {
      if (context?.previousVote) {
        queryClient.setQueryData(voteQueryKey, context.previousVote);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: voteQueryKey });
      const previousVote = queryClient.getQueryData<VoteState>(voteQueryKey);
      const currentVote = previousVote ?? voteState;
      const nextVote = !currentVote.voted;

      ignoreNextRealtimeEvent(nextVote ? "INSERT" : "DELETE");
      queryClient.setQueryData<VoteState>(voteQueryKey, {
        count: Math.max(0, currentVote.count + (nextVote ? 1 : -1)),
        voted: nextVote,
      });

      return { previousVote };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(voteQueryKey, data);
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
    },
  });
  const signedIn = isSignedIn ?? initialSignedIn;

  useEffect(() => {
    const supabase = createBrowserSupabase();

    if (!supabase) {
      return;
    }

    const realtime = supabase;
    let channel: ReturnType<typeof realtime.channel> | null = null;
    let inactiveTimer: number | null = null;
    let hasConnected = false;

    function updateVoteState(payload: ProjectVotePayload) {
      if (payload.eventType === "UPDATE") {
        return;
      }

      const voterId = payload.new?.voter_id ?? payload.old?.voter_id;

      if (voterId) {
        const key = realtimeEventKey(payload.eventType, projectId, voterId);
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
      const effectVoteQueryKey = projectQueryKeys.votes(projectId);

      queryClient.setQueryData<VoteState>(effectVoteQueryKey, (current) => {
        const currentVote = current ?? {
          count: initialCount,
          voted: initialVoted,
        };

        return {
          count: Math.max(0, currentVote.count + delta),
          voted:
            voterId === user?.id
              ? payload.eventType === "INSERT"
              : currentVote.voted,
        };
      });
    }

    function disconnect() {
      if (inactiveTimer) {
        window.clearTimeout(inactiveTimer);
        inactiveTimer = null;
      }

      if (!channel) {
        return;
      }

      const currentChannel = channel;
      channel = null;
      void realtime.removeChannel(currentChannel);
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

      if (channel) {
        scheduleDisconnect();
        return;
      }

      const shouldReconcile = hasConnected;
      hasConnected = true;
      channel = realtime
        .channel(`project-votes-${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_votes",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => updateVoteState(payload as ProjectVotePayload),
        )
        .subscribe();

      if (shouldReconcile) {
        void queryClient.invalidateQueries({
          queryKey: projectQueryKeys.votes(projectId),
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
  }, [initialCount, initialVoted, projectId, queryClient, user?.id]);

  useEffect(
    () => () => {
      for (const timeout of ignoredRealtimeTimeoutsRef.current) {
        clearTimeout(timeout);
      }
    },
    [],
  );

  function vote() {
    if (voteMutation.isPending) {
      return;
    }

    voteMutation.mutate();
  }

  if (!signedIn) {
    return (
      <SignInButton mode="modal">
        <Button
          className="h-12 px-5 text-sm uppercase tracking-[0.18em]"
          type="button"
        >
          Sign in to vote ({voteState.count})
        </Button>
      </SignInButton>
    );
  }

  return (
    <Button
      className="h-12 px-5 text-sm uppercase tracking-[0.18em]"
      aria-disabled={voteMutation.isPending}
      onClick={vote}
      type="button"
    >
      {voteState.voted
        ? `Voted (${voteState.count})`
        : `Vote (${voteState.count})`}
    </Button>
  );
}
