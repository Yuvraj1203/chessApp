"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toLocalInput } from "@/lib/format";
import {
  useCreateTournament,
  useUpdateTournament,
  type TournamentInput,
} from "@/lib/queries";
import type { Tournament } from "@/lib/types";

const PRESETS = ["3+0", "5+0", "5+3", "10+0", "10+5"];

function defaultStart(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.toISOString());
}

/** Create (no `tournament`) or edit (with `tournament`) in one dialog. */
export function TournamentFormDialog({
  open,
  onOpenChange,
  tournament,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament?: Tournament;
}) {
  const editing = !!tournament;
  const locked = editing && tournament.status !== "draft" && tournament.status !== "open";
  const create = useCreateTournament();
  const update = useUpdateTournament(tournament?.id ?? "");
  const mutation = editing ? update : create;

  const [name, setName] = useState(tournament?.name ?? "");
  const [timeControl, setTimeControl] = useState(tournament?.timeControl ?? "5+0");
  const [startsAt, setStartsAt] = useState(
    tournament ? toLocalInput(tournament.startsAt) : defaultStart(),
  );
  const [open_, setOpen] = useState(tournament ? tournament.status !== "draft" : false);
  const [allowRematch, setAllowRematch] = useState(tournament?.allowRematch ?? false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const base = { name, timeControl, startsAt: new Date(startsAt).toISOString() };
    if (editing) {
      update.mutate(
        locked ? { name: base.name, startsAt: base.startsAt } : { ...base, allowRematch },
        {
          onSuccess: () => {
            toast.success("Tournament updated");
            onOpenChange(false);
          },
        },
      );
    } else {
      const input: TournamentInput = {
        ...base,
        allowRematch,
        status: open_ ? "open" : "draft",
      };
      create.mutate(input, {
        onSuccess: () => {
          toast.success("Tournament created");
          onOpenChange(false);
        },
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tournament" : "New tournament"}</DialogTitle>
            <DialogDescription>
              Opponents are paired automatically — no manual pairing.
            </DialogDescription>
          </DialogHeader>
          {mutation.error && <ErrorState error={mutation.error} title="Could not save" />}
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Name</Label>
            <Input
              id="t-name"
              required
              minLength={3}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-tc">Time control (minutes+increment seconds)</Label>
            <Input
              id="t-tc"
              required
              pattern="\d{1,3}\+\d{1,3}"
              disabled={locked}
              value={timeControl}
              onChange={(e) => setTimeControl(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="xs"
                  variant={timeControl === p ? "default" : "outline"}
                  disabled={locked}
                  onClick={() => setTimeControl(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-start">Starts at (your local time)</Label>
            <Input
              id="t-start"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="t-rematch">Allow rematches</Label>
              <p className="text-xs text-muted-foreground">
                Off = round robin: everyone plays everyone once.
              </p>
            </div>
            <Switch
              id="t-rematch"
              checked={allowRematch}
              disabled={locked}
              onCheckedChange={setAllowRematch}
            />
          </div>
          {!editing && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="t-open">Open for joining now</Label>
                <p className="text-xs text-muted-foreground">
                  Otherwise it stays a draft, hidden from students.
                </p>
              </div>
              <Switch id="t-open" checked={open_} onCheckedChange={setOpen} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Create tournament"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
