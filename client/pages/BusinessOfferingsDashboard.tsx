import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";
import { toast } from "@/components/ui/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export default function BusinessOfferingsDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [productSearch, setProductSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["business-offerings"],
    queryFn: () => apiClient.getBusinessOfferings(),
    staleTime: 10000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiClient.getClients(),
    staleTime: 30000,
  });

  const productFiltered = productSearch.trim()
    ? (data as any[]).filter((o: any) =>
        (o.product || "").toLowerCase().includes(productSearch.toLowerCase()),
      )
    : (data as any[]) || [];

  function parseNotesMeta(notes?: string | null): any {
    if (!notes) return {};
    try {
      const obj = JSON.parse(notes);
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }
  function isDomesticByGeography(client?: any): boolean {
    if (!client) return true;
    const meta = parseNotesMeta(client.notes);
    const geography: string | undefined =
      meta.geography || meta.client_geography;
    if (!geography) return true;
    return String(geography).toLowerCase() === "domestic";
  }

  // Helper to get client for an offering
  const getClientForOffering = (offering: any) => {
    return (clients as any[]).find((c) => c.id === offering.client_id) || null;
  };

  const stats = { total: (data as any[]).length };

  const [sheetOpen, setSheetOpen] = useState(false);

  const salesSummary = useMemo(() => {
    const domClientIds = new Set<number>();
    const intlClientIds = new Set<number>();

    const clientAgg: Record<
      number,
      {
        client: any;
        offerings: any[];
        mrrLacs: number;
        currArrUsdMn: number;
        projArrUsdMn: number;
        domestic: boolean;
      }
    > = {};

    ((clients as any[]) || []).forEach((c: any) => {
      const domestic = isDomesticByGeography(c);
      if (domestic) domClientIds.add(c.id);
      else intlClientIds.add(c.id);
      clientAgg[c.id] = {
        client: c,
        offerings: [],
        mrrLacs: 0,
        currArrUsdMn: 0,
        projArrUsdMn: 0,
        domestic,
      };
    });

    ((data as any[]) || []).forEach((o: any) => {
      const client = getClientForOffering(o);
      const clientId: number | undefined = client?.id;
      const domestic = isDomesticByGeography(client);
      if (clientId != null) {
        if (!clientAgg[clientId]) {
          clientAgg[clientId] = {
            client,
            offerings: [],
            mrrLacs: 0,
            currArrUsdMn: 0,
            projArrUsdMn: 0,
            domestic,
          };
          if (domestic) domClientIds.add(clientId);
          else intlClientIds.add(clientId);
        }
        clientAgg[clientId].offerings.push(o);
        clientAgg[clientId].mrrLacs += Number(o.potential_mrr_lacs || 0);
        clientAgg[clientId].currArrUsdMn += Number(
          o.current_potential_arr_usd_mn || 0,
        );
        clientAgg[clientId].projArrUsdMn += Number(
          o.projected_potential_arr_usd_mn || 0,
        );
      }
    });

    const totals = {
      domestic: {
        clients: Array.from(domClientIds).length,
        mrrLacs: 0,
        currArrUsdMn: 0,
        projArrUsdMn: 0,
      },
      international: {
        clients: Array.from(intlClientIds).length,
        mrrLacs: 0,
        currArrUsdMn: 0,
        projArrUsdMn: 0,
      },
      clientAgg,
    };

    Object.values(clientAgg).forEach((row) => {
      if (row.domestic) {
        totals.domestic.mrrLacs += row.mrrLacs;
        totals.domestic.currArrUsdMn += row.currArrUsdMn;
        totals.domestic.projArrUsdMn += row.projArrUsdMn;
      } else {
        totals.international.mrrLacs += row.mrrLacs;
        totals.international.currArrUsdMn += row.currArrUsdMn;
        totals.international.projArrUsdMn += row.projArrUsdMn;
      }
    });

    const topClients = Object.values(clientAgg)
      .sort((a, b) => {
        const aScore = a.currArrUsdMn * 100 + a.mrrLacs;
        const bScore = b.currArrUsdMn * 100 + b.mrrLacs;
        return bScore - aScore;
      })
      .slice(0, 5);

    return { totals, topClients };
  }, [clients, data]);

  // Fetch steps for offerings to compute progress (lightweight, capped by React Query cache)
  const stepQueries = useQueries({
    queries: (data as any[]).map((o) => ({
      queryKey: ["business-offering-steps", o.id],
      queryFn: () => apiClient.getBusinessOfferingSteps(o.id),
      enabled: (data as any[]).length <= 50,
      staleTime: 10000,
    })),
  });

  const progressMap: Record<number, number> = {};
  (data as any[]).forEach((o, idx) => {
    const q = stepQueries[idx];
    const steps = (q?.data as any[]) || [];
    if (!steps.length) return;
    let totalCompletedProbability = 0;
    let totalStepProbability = 0;
    steps.forEach((s: any) => {
      const prob = parseFloat(s.probability_percent) || 0;
      totalStepProbability += prob;
      if (s.status === "completed") totalCompletedProbability += prob;
    });
    const percent = totalStepProbability
      ? Math.min(100, Math.round(totalCompletedProbability))
      : (() => {
          const completed = steps.filter(
            (s: any) => s.status === "completed",
          ).length;
          const inProg = steps.filter(
            (s: any) => s.status === "in_progress",
          ).length;
          const total = steps.length;
          return total
            ? Math.round(((completed + inProg * 0.5) / total) * 100)
            : 0;
        })();
    progressMap[o.id] = percent;
  });

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await apiClient.deleteBusinessOffering(deleteId);
      toast({ title: "Deleted", description: "Business Offering removed" });
      queryClient.invalidateQueries({ queryKey: ["business-offerings"] });
      setDeleteId(null);
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message || "Failed",
        variant: "destructive",
      });
    }
  };

  // Load all follow-ups and filter for business offerings
  const { data: allFollowUps = [], isLoading: followUpsLoading } = useQuery({
    queryKey: ["follow-ups-dashboard"],
    queryFn: async () => {
      try {
        return await apiClient.getAllFollowUps({});
      } catch {
        return [];
      }
    },
    staleTime: 30000,
  });

  const boFollowUps = (allFollowUps as any[]).filter(
    (f) => f.business_offering_id != null,
  );

  function SeeList({ clients }: { clients: any[] }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    return (
      <div className="mt-3">
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide list" : "See list"}
        </button>
        {open && (
          <div className="mt-3 space-y-2">
            {clients.length === 0 && (
              <div className="text-sm text-gray-500">No clients</div>
            )}
            {clients.map((row: any) => (
              <div
                key={row.client.id}
                className="flex items-center justify-between p-3 border rounded-md bg-white"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate max-w-[220px]">
                    {row.client.client_name}
                  </div>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600">
                    <div>
                      <span className="font-medium">Current MRR:</span> ₹{" "}
                      {row.mrrLacs.toFixed(2)} Lacs
                    </div>
                    <div>
                      <span className="font-medium">Current ARR:</span>{" "}
                      {row.currArrUsdMn.toFixed(3)} Mn USD
                    </div>
                    <div>
                      <span className="font-medium">Potential ARR:</span>{" "}
                      {row.projArrUsdMn.toFixed(3)} Mn USD
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/clients/${row.client.id}`)}
                >
                  View
                </Button>
              </div>
            ))}
            {Object.keys(salesSummary.totals.clientAgg).length > 5 && (
              <div className="pt-1">
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => navigate("/sales/clients")}
                >
                  Show more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-blue-600" /> Sales
          </h1>
          <p className="text-gray-600 mt-1">
            Manage business offerings and pipeline
          </p>
        </div>
        <Button onClick={() => navigate("/business-offerings/create")}>
          <Plus className="w-4 h-4 mr-2" /> Create Sales
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Offerings</CardTitle>
            <CardDescription>All captured business offerings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Domestic</CardTitle>
            <CardDescription>India-based clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {salesSummary.totals.domestic.clients}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>International</CardTitle>
            <CardDescription>Non-India clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {salesSummary.totals.international.clients}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6 w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sales Summary</CardTitle>
            <CardDescription>Totals with details on tap</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Expand details"
            onClick={() => setSheetOpen(true)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-hidden rounded-md border">
            <div className="grid grid-cols-2 text-xs font-medium bg-gray-50 border-b">
              <div className="px-3 py-2">Label</div>
              <div className="px-3 py-2 text-center">Total</div>
            </div>
            <div className="divide-y text-sm">
              <div className="flex items-center">
                <div className="px-3 py-2 flex-1">No. of Clients</div>
                <div className="px-3 py-2 w-28 text-center font-semibold">
                  {salesSummary.totals.domestic.clients +
                    salesSummary.totals.international.clients}
                </div>
              </div>

              <div className="flex items-center">
                <div className="px-3 py-2 flex-1">Current MRR</div>
                <div className="px-3 py-2 w-28 text-center">
                  ₹{" "}
                  {(
                    salesSummary.totals.domestic.mrrLacs +
                    salesSummary.totals.international.mrrLacs
                  ).toFixed(2)}{" "}
                  Lacs
                </div>
              </div>

              <div className="flex items-center">
                <div className="px-3 py-2 flex-1">Current ARR</div>
                <div className="px-3 py-2 w-28 text-center">
                  {(
                    salesSummary.totals.domestic.currArrUsdMn +
                    salesSummary.totals.international.currArrUsdMn
                  ).toFixed(3)}{" "}
                  Mn USD
                </div>
              </div>

              <div className="flex items-center">
                <div className="px-3 py-2 flex-1">Potential ARR</div>
                <div className="px-3 py-2 w-28 text-center">
                  {(
                    salesSummary.totals.domestic.projArrUsdMn +
                    salesSummary.totals.international.projArrUsdMn
                  ).toFixed(3)}{" "}
                  Mn USD
                </div>
              </div>
            </div>
          </div>

          <SeeList clients={salesSummary.topClients} />

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="sm:max-w-lg w-full">
              <SheetHeader>
                <SheetTitle>Sales Summary Details</SheetTitle>
                <SheetDescription>Domestic vs International</SheetDescription>
              </SheetHeader>

              <div className="mt-4 overflow-hidden rounded-md border">
                <div className="grid grid-cols-3 text-xs font-medium bg-gray-50 border-b">
                  <div className="px-3 py-2">Label</div>
                  <div className="px-3 py-2 text-center">Domestic</div>
                  <div className="px-3 py-2 text-center">International</div>
                </div>
                <div className="text-sm divide-y">
                  <div className="grid grid-cols-3">
                    <div className="px-3 py-2">No. of Clients</div>
                    <div className="px-3 py-2 text-center font-semibold">
                      {salesSummary.totals.domestic.clients}
                    </div>
                    <div className="px-3 py-2 text-center font-semibold">
                      {salesSummary.totals.international.clients}
                    </div>
                  </div>
                  <div className="grid grid-cols-3">
                    <div className="px-3 py-2">Current MRR</div>
                    <div className="px-3 py-2 text-center">
                      ₹ {salesSummary.totals.domestic.mrrLacs.toFixed(2)} Lacs
                    </div>
                    <div className="px-3 py-2 text-center">
                      ₹ {salesSummary.totals.international.mrrLacs.toFixed(2)}{" "}
                      Lacs
                    </div>
                  </div>
                  <div className="grid grid-cols-3">
                    <div className="px-3 py-2">Current ARR</div>
                    <div className="px-3 py-2 text-center">
                      {salesSummary.totals.domestic.currArrUsdMn.toFixed(3)} Mn
                      USD
                    </div>
                    <div className="px-3 py-2 text-center">
                      {salesSummary.totals.international.currArrUsdMn.toFixed(
                        3,
                      )}{" "}
                      Mn USD
                    </div>
                  </div>
                  <div className="grid grid-cols-3">
                    <div className="px-3 py-2">Potential ARR</div>
                    <div className="px-3 py-2 text-center">
                      {salesSummary.totals.domestic.projArrUsdMn.toFixed(3)} Mn
                      USD
                    </div>
                    <div className="px-3 py-2 text-center">
                      {salesSummary.totals.international.projArrUsdMn.toFixed(
                        3,
                      )}{" "}
                      Mn USD
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pipeline Status Overview</CardTitle>
          <CardDescription>Client-wise current stage summary</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            // Build current stage per offering (first non-completed step, else Completed)
            type StageGroup = {
              label: string;
              items: { client: any; offeringId: number }[];
            };
            const groupsMap: Record<string, StageGroup> = {};

            (data as any[]).forEach((o: any, idx: number) => {
              const q = stepQueries[idx];
              const steps = (q?.data as any[]) || [];
              const sorted = [...steps].sort(
                (a, b) => (a.order ?? 0) - (b.order ?? 0),
              );
              const current = sorted.find((s) => s.status !== "completed");
              const label = current
                ? current.name || "In Progress"
                : "Completed";
              if (!groupsMap[label]) groupsMap[label] = { label, items: [] };
              const client = getClientForOffering(o);
              groupsMap[label].items.push({ client, offeringId: o.id });
            });

            const groups = Object.values(groupsMap).sort(
              (a, b) => b.items.length - a.items.length,
            );
            if (groups.length === 0)
              return <div className="text-gray-600">No pipeline data</div>;
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {groups.map((g) => (
                  <div key={g.label} className="p-3 border rounded-lg bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 truncate pr-2">
                        Stage
                      </div>
                      <Badge variant="secondary">{g.items.length}</Badge>
                    </div>
                    <div className="font-medium mt-1 truncate" title={g.label}>
                      {g.label}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {g.items.slice(0, 3).map((it, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() =>
                            navigate(`/business-offerings/${it.offeringId}`)
                          }
                          title={it.client?.client_name || "View"}
                        >
                          {it.client?.client_name || `#${it.offeringId}`}
                        </Button>
                      ))}
                      {g.items.length > 3 && (
                        <div className="text-[10px] text-gray-500 self-center">
                          +{g.items.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pipeline Status Overview (Bar)</CardTitle>
          <CardDescription>
            Step-wise counts with client context
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            type StageRow = { name: string; count: number; clients: string[] };
            const groupsMap: Record<string, StageRow> = {};
            (data as any[]).forEach((o: any, idx: number) => {
              const q = stepQueries[idx];
              const steps = (q?.data as any[]) || [];
              const sorted = [...steps].sort(
                (a, b) => (a.order ?? 0) - (b.order ?? 0),
              );
              const current = sorted.find((s) => s.status !== "completed");
              const label = current
                ? current.name || "In Progress"
                : "Completed";
              const client = getClientForOffering(o);
              const clientName = client?.client_name || `#${o.id}`;
              if (!groupsMap[label])
                groupsMap[label] = { name: label, count: 0, clients: [] };
              groupsMap[label].count += 1;
              if (groupsMap[label].clients.length < 50)
                groupsMap[label].clients.push(clientName);
            });
            const rows: StageRow[] = Object.values(groupsMap).sort(
              (a, b) => b.count - a.count,
            );
            if (rows.length === 0)
              return <div className="text-gray-600">No pipeline data</div>;
            return (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rows}
                    margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const clients = (payload[0].payload as any)
                          .clients as string[];
                        return (
                          <div className="rounded-md border bg-white p-2 text-xs shadow">
                            <div className="font-medium mb-1">{label}</div>
                            <div className="max-w-[260px]">
                              {clients.slice(0, 8).join(", ")}
                              {clients.length > 8 && (
                                <span className="text-gray-500">
                                  {" "}
                                  {`+${clients.length - 8} more`}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" fill="#60a5fa">
                      <LabelList
                        dataKey="count"
                        position="top"
                        className="text-xs"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Products wise accordion */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Group by product with counts</CardDescription>
          <div className="mt-2">
            <Label className="text-sm">Filter products</Label>
            <Input
              placeholder="Type product name"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const groups: Record<string, any[]> = {};
            const source = productFiltered;
            source.forEach((o: any) => {
              const key = o.product || "Unknown";
              if (!groups[key]) groups[key] = [];
              groups[key].push(o);
            });
            const keys = Object.keys(groups).sort();
            if (keys.length === 0)
              return <div className="text-gray-600">No entries</div>;
            return (
              <Accordion type="single" collapsible className="w-full">
                {keys.map((k) => {
                  const list = groups[k] || [];
                  return (
                    <AccordionItem key={k} value={k}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{k}</span>
                          <Badge variant="secondary">{list.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {list.map((o: any) => {
                            const percent = progressMap[o.id] || 0;
                            const client = getClientForOffering(o);
                            return (
                              <div
                                key={o.id}
                                className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:shadow-sm"
                                onClick={() =>
                                  navigate(`/business-offerings/${o.id}`)
                                }
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="font-medium text-gray-900">
                                      {o.product || o.solution || "Offering"}
                                    </div>
                                    {o.client_status && (
                                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                        {o.client_status}
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-4 text-xs text-gray-600 mb-2">
                                    <div>
                                      <span className="font-medium">
                                        Client:
                                      </span>{" "}
                                      {client?.client_name || "-"}
                                    </div>
                                    <div>
                                      <span className="font-medium">
                                        Contact:
                                      </span>{" "}
                                      {client?.contact_person || "-"}
                                    </div>
                                    <div>
                                      <span className="font-medium">
                                        Location:
                                      </span>{" "}
                                      {client?.city || client?.country || "-"}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                                    <div>
                                      <span className="font-medium">MRR:</span>{" "}
                                      {o.potential_mrr_lacs
                                        ? `${o.potential_mrr_lacs} Lacs`
                                        : "-"}
                                    </div>
                                    <div>
                                      <span className="font-medium">ARR:</span>{" "}
                                      {o.current_potential_arr_usd_mn
                                        ? `$${o.current_potential_arr_usd_mn}Mn`
                                        : "-"}
                                    </div>
                                  </div>

                                  {o.offering_description && (
                                    <div className="text-xs text-gray-500 mt-2 line-clamp-2">
                                      {o.offering_description}
                                    </div>
                                  )}
                                </div>

                                <div className="hidden md:flex items-center gap-3 ml-4">
                                  <div className="w-32 bg-gray-200 rounded h-2">
                                    <div
                                      className={`${percent >= 100 ? "bg-green-500" : percent >= 50 ? "bg-blue-500" : "bg-orange-500"} h-2 rounded`}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-700 font-medium w-8 text-right">
                                    {percent}%
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(o.id);
                                    }}
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </div>

                                <div className="md:hidden ml-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(o.id);
                                    }}
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            );
          })()}
        </CardContent>
      </Card>

      {/* Follow-up Status Cards for Business Offerings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {(() => {
          const now = new Date();
          const currentDueFollowUps = (boFollowUps || []).filter(
            (followUp: any) => {
              if (followUp.status === "completed") return false;
              const dueDate = followUp.due_date
                ? new Date(followUp.due_date)
                : new Date(
                    new Date(followUp.created_at).getTime() +
                      3 * 24 * 60 * 60 * 1000,
                  );
              if (isNaN(dueDate.getTime())) return false;
              const timeDiff = dueDate.getTime() - now.getTime();
              const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
              return diffDays >= 0 && diffDays <= 7;
            },
          );

          const overdueFollowUps = (boFollowUps || []).filter(
            (followUp: any) => {
              if (followUp.status === "completed") return false;
              const dueDate = followUp.due_date
                ? new Date(followUp.due_date)
                : new Date(
                    new Date(followUp.created_at).getTime() +
                      3 * 24 * 60 * 60 * 1000,
                  );
              if (isNaN(dueDate.getTime())) return false;
              return dueDate < now;
            },
          );

          return (
            <>
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-blue-900 flex items-center">
                        <Clock className="w-5 h-5 mr-2" /> Follow-ups Due
                      </CardTitle>
                      <CardDescription className="text-blue-700">
                        Follow-ups due within the next 7 days (
                        {currentDueFollowUps.length} items)
                      </CardDescription>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-blue-200 text-blue-800"
                    >
                      {currentDueFollowUps.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {followUpsLoading ? (
                    <div className="p-6 text-center text-gray-500">
                      Loading follow-ups...
                    </div>
                  ) : currentDueFollowUps.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-blue-500" />
                      </div>
                      <p className="text-gray-600 font-medium">
                        All caught up!
                      </p>
                      <p className="text-gray-500 text-sm">
                        No follow-ups due in the next 7 days
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(100vh-400px)] min-h-[200px] overflow-y-auto">
                      {currentDueFollowUps.map(
                        (followUp: any, index: number) => {
                          const dueDate = followUp.due_date
                            ? new Date(followUp.due_date)
                            : new Date(
                                new Date(followUp.created_at).getTime() +
                                  3 * 24 * 60 * 60 * 1000,
                              );
                          const diffDays = Math.ceil(
                            (dueDate.getTime() - now.getTime()) /
                              (1000 * 60 * 60 * 24),
                          );
                          const isToday = diffDays === 0;
                          const isTomorrow = diffDays === 1;
                          return (
                            <div
                              key={followUp.id}
                              className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${index === currentDueFollowUps.length - 1 ? "border-b-0" : ""}`}
                              onClick={() =>
                                navigate(`/follow-ups?id=${followUp.id}`)
                              }
                              title={
                                followUp.description ||
                                followUp.title ||
                                "No description available"
                              }
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
                                      {followUp.title}
                                    </h4>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${isToday ? "border-orange-300 text-orange-700 bg-orange-50" : isTomorrow ? "border-yellow-300 text-yellow-700 bg-yellow-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}
                                    >
                                      {isToday
                                        ? "Today"
                                        : isTomorrow
                                          ? "Tomorrow"
                                          : `${diffDays} days`}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                                    <span>
                                      Offering:{" "}
                                      {followUp.business_offering_product ||
                                        followUp.business_offering_solution ||
                                        "Unknown"}
                                    </span>
                                    <span>
                                      Step:{" "}
                                      {followUp.business_offering_step_name ||
                                        "N/A"}
                                    </span>
                                    <span>
                                      Assigned to:{" "}
                                      {followUp.assigned_user_name ||
                                        "Unassigned"}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right text-xs text-gray-500">
                                  Due:{" "}
                                  {followUp.due_date
                                    ? (() => {
                                        const utcDate = new Date(
                                          followUp.due_date,
                                        );
                                        const y = utcDate.getFullYear();
                                        const m = String(
                                          utcDate.getMonth() + 1,
                                        ).padStart(2, "0");
                                        const d = String(
                                          utcDate.getDate(),
                                        ).padStart(2, "0");
                                        return `${y}-${m}-${d}`;
                                      })()
                                    : "No date"}
                                </div>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-red-50 to-red-100 border-b border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-red-900 flex items-center">
                        <XCircle className="w-5 h-5 mr-2" /> Overdue Follow-ups
                      </CardTitle>
                      <CardDescription className="text-red-700">
                        Follow-ups that are past their due date (
                        {overdueFollowUps.length} items)
                      </CardDescription>
                    </div>
                    <Badge
                      variant="destructive"
                      className="bg-red-200 text-red-800"
                    >
                      {overdueFollowUps.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {followUpsLoading ? (
                    <div className="p-6 text-center text-gray-500">
                      Loading follow-ups...
                    </div>
                  ) : overdueFollowUps.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      </div>
                      <p className="text-gray-600 font-medium">Great job!</p>
                      <p className="text-gray-500 text-sm">
                        No overdue follow-ups
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(100vh-400px)] min-h-[200px] overflow-y-auto">
                      {overdueFollowUps.map((followUp: any) => (
                        <div
                          key={followUp.id}
                          className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() =>
                            navigate(`/follow-ups?id=${followUp.id}`)
                          }
                          title={
                            followUp.description ||
                            followUp.title ||
                            "No description available"
                          }
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
                                  {followUp.title}
                                </h4>
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span>
                                  Offering:{" "}
                                  {followUp.business_offering_product ||
                                    followUp.business_offering_solution ||
                                    "Unknown"}
                                </span>
                                <span>
                                  Step:{" "}
                                  {followUp.business_offering_step_name ||
                                    "N/A"}
                                </span>
                                <span>
                                  Assigned to:{" "}
                                  {followUp.assigned_user_name || "Unassigned"}
                                </span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              Due:{" "}
                              {followUp.due_date
                                ? (() => {
                                    const utcDate = new Date(followUp.due_date);
                                    const y = utcDate.getFullYear();
                                    const m = String(
                                      utcDate.getMonth() + 1,
                                    ).padStart(2, "0");
                                    const d = String(
                                      utcDate.getDate(),
                                    ).padStart(2, "0");
                                    return `${y}-${m}-${d}`;
                                  })()
                                : "No date"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Business Offering?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All related steps and comments will
              be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
