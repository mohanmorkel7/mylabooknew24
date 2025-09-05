import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import BusinessOfferings from "@/pages/BusinessOfferings";

export default function BusinessOfferingsEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["business-offering", id],
    queryFn: async () => (id ? apiClient.getBusinessOffering(Number(id)) : null),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error || !data) return <div className="p-6 text-red-600">Failed to load</div>;

  // Reuse create form by providing initial state via URL state not implemented; keep simple for now
  return <BusinessOfferings />;
}
