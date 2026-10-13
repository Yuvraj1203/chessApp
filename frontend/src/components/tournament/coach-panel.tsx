"use client";

import { Loader2, Pencil, Play, Rocket, Trash2, Trophy, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { TournamentFormDialog } from "@/components/tournament/tournament-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAddParticipant,
  useDeleteTournament,
  useRemoveParticipant,
  useStudents,
  useTournamentStats,
  useUpdateTournament,
} from "@/lib/queries";
import type { TournamentDetail } from "@/lib/types";

export function CoachControls({ t }: { t: TournamentDetail }) {
  const router = useRouter();
  const update = useUpdateTournament(t.id);
  const remove = useDeleteTournament(t.id);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const next =
    t.status === "draft"
      ? { to: "open" as const, label: "Open for joining", icon: <Rocket /> }
      : t.status === "open"
        ? { to: "ongoing" as const, label: "Start tournament", icon: <Play /> }
        : t.status === "ongoing"
          ? { to: "completed" as const, label: "Complete & declare winner", icon: <Trophy /> }
          : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {next && (
        <Button
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { status: next.to },
              {
                onSuccess: () => toast.success(`Status: ${next.to}`),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          {update.isPending ? <Loader2 className="animate-spin" /> : next.icon}
          {next.label}
        </Button>
      )}
      {t.status === "open" && (
        <Button
          variant="outline"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({ status: "completed" }, { onError: (e) => toast.error(e.message) })
          }
        >
          Close without starting
        </Button>
      )}
      {t.status !== "completed" && (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
      )}
      <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
        <Trash2 /> Delete
      </Button>

      {editing && <TournamentFormDialog open onOpenChange={setEditing} tournament={t} />}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{t.name}”?</DialogTitle>
            <DialogDescription>
              This removes the tournament, its participants and all match records. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {remove.error && <ErrorState error={remove.error} title="Could not delete" />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Tournament deleted");
                    router.replace("/tournaments");
                  },
                })
              }
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StatsCards({ id }: { id: string }) {
  const { data, isPending, error, refetch } = useTournamentStats(id, true);
  if (isPending) return <RowsSkeleton rows={1} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} title="Could not load stats" />;
  const items = [
    ["Players", data.participants],
    ["Games played", `${data.completedMatches}/${data.possibleMatches}`],
    ["In progress", data.activeMatches],
    ["White wins", data.whiteWins],
    ["Black wins", data.blackWins],
    ["Draws", data.draws],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <Card key={label} size="sm">
          <CardContent className="py-3">
            <div className="text-2xl font-bold text-primary">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ParticipantsPanel({ t, isCoach }: { t: TournamentDetail; isCoach: boolean }) {
  const students = useStudents(isCoach);
  const add = useAddParticipant(t.id);
  const remove = useRemoveParticipant(t.id);
  const joined = new Set(t.participants.map((p) => p.id));
  const available = (students.data ?? []).filter((s) => !joined.has(s.id));
  const canEdit = isCoach && t.status !== "completed";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Participants ({t.participants.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {t.participants.length === 0 ? (
            <EmptyState title="Nobody has joined yet" />
          ) : (
            t.participants.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted">
                <span className="text-sm">{p.name}</span>
                {canEdit && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove ${p.name}`}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(p.id, { onError: (e) => toast.error(e.message) })
                    }
                  >
                    <UserMinus />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add students</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {students.isPending ? (
              <RowsSkeleton rows={3} />
            ) : students.error ? (
              <ErrorState error={students.error} onRetry={() => void students.refetch()} />
            ) : available.length === 0 ? (
              <EmptyState title="Every student is already in" />
            ) : (
              available.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted">
                  <span className="text-sm">
                    {s.name} <span className="text-xs text-muted-foreground">{s.email}</span>
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={add.isPending || t.status === "completed"}
                    onClick={() =>
                      add.mutate(s.id, {
                        onSuccess: () => toast.success(`${s.name} added`),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    <UserPlus /> Add
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
