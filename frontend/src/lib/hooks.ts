import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, type Page } from "./api";
import { useToast } from "../components/ui/Toast";
import { errorMessage } from "./api";
import { useTranslation } from "react-i18next";

export function useList<T>(path: string, params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    queryKey: [path, params],
    queryFn: async () => (await api.get<Page<T>>(path, { params })).data,
    enabled,
  });
}

export function useAll<T>(path: string, params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    queryKey: [path, "all", params],
    queryFn: async () => {
      const d = (await api.get<T[] | Page<T>>(path, { params: { page_size: 500, ...params } })).data;
      return Array.isArray(d) ? d : d.results;
    },
    enabled,
  });
}

export function useGet<T>(path: string | null, params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: [path, params],
    queryFn: async () => (await api.get<T>(path!, { params })).data,
    enabled: !!path,
  });
}

/** Mutation that shows success/error toasts and invalidates related queries. */
export function useAction<TIn = unknown, TOut = unknown>(
  fn: (v: TIn) => Promise<TOut>,
  opts: { invalidate?: QueryKey[]; success?: string; onSuccess?: (d: TOut) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onSuccess: (d) => {
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ["/notifications/"] });
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(d);
    },
    onError: (e) => {
      const m = errorMessage(e);
      toast.error(m === "network" ? t("errors.network") : m);
    },
  });
}
