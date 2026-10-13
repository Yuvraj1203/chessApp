import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, del, patch, post } from "./api";
import type {
  HistoryItem,
  StandingRow,
  Student,
  Tournament,
  TournamentDetail,
  TournamentMatch,
  TournamentStats,
} from "./types";

export const useTournaments = () =>
  useQuery({ queryKey: ["tournaments"], queryFn: () => api<Tournament[]>("/tournaments") });

export const useTournament = (id: string) =>
  useQuery({
    queryKey: ["tournament", id],
    queryFn: () => api<TournamentDetail>(`/tournaments/${id}`),
  });

export const useLeaderboard = (id: string) =>
  useQuery({
    queryKey: ["leaderboard", id],
    queryFn: () => api<StandingRow[]>(`/tournaments/${id}/leaderboard`),
  });

export const useTournamentMatches = (id: string) =>
  useQuery({
    queryKey: ["tournament-matches", id],
    queryFn: () => api<TournamentMatch[]>(`/tournaments/${id}/matches`),
  });

export const useTournamentStats = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["tournament-stats", id],
    queryFn: () => api<TournamentStats>(`/tournaments/${id}/stats`),
    enabled,
  });

export const useStudents = (enabled: boolean) =>
  useQuery({
    queryKey: ["students"],
    queryFn: () => api<Student[]>("/users/students"),
    enabled,
  });

export const useMyMatches = () =>
  useQuery({ queryKey: ["my-matches"], queryFn: () => api<HistoryItem[]>("/matches/mine") });

/** Everything that depends on a tournament's state. */
function invalidateTournament(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ["tournaments"] });
  if (id) {
    for (const k of ["tournament", "leaderboard", "tournament-matches", "tournament-stats"]) {
      qc.invalidateQueries({ queryKey: [k, id] });
    }
  }
}

export interface TournamentInput {
  name: string;
  timeControl: string;
  startsAt: string;
  status?: "draft" | "open";
  allowRematch?: boolean;
}

export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TournamentInput) => post<TournamentDetail>("/tournaments", input),
    onSuccess: () => invalidateTournament(qc),
  });
}

export function useUpdateTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<Omit<TournamentInput, "status">> & { status?: Tournament["status"] },
    ) =>
      patch<TournamentDetail>(`/tournaments/${id}`, input),
    onSuccess: () => invalidateTournament(qc, id),
  });
}

export function useDeleteTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => del(`/tournaments/${id}`),
    onSuccess: () => invalidateTournament(qc),
  });
}

export function useJoinTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<TournamentDetail>(`/tournaments/${id}/join`),
    onSuccess: (_d, id) => invalidateTournament(qc, id),
  });
}

export function useAddParticipant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => post(`/tournaments/${id}/participants`, { userId }),
    onSuccess: () => invalidateTournament(qc, id),
  });
}

export function useRemoveParticipant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => del(`/tournaments/${id}/participants/${userId}`),
    onSuccess: () => invalidateTournament(qc, id),
  });
}
