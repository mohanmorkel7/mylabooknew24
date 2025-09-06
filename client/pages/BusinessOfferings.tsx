import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ArrowLeft, Briefcase, Check, ChevronsUpDown } from "lucide-react";

function rangeSteps(
  start: number,
  end: number,
  step: number,
  decimals = 2,
): string[] {
  const res: string[] = [];
  const scale = Math.pow(10, decimals);
  const s = Math.round(start * scale);
  const e = Math.round(end * scale);
  const st = Math.round(step * scale);
  for (let v = s; v <= e; v += st) res.push((v / scale).toFixed(decimals));
  return res;
}

const SOLUTIONS = [
  "Acquiring Support",
  "Card Payments",
  "UPI Payments",
  "Payment Orcestration",
];

const PRODUCTS = [
  "ToxenX",
  "Mylapay3DSecure",
  "C-Switch",
  "U-Switch",
  "SwitchX",
  "IntelleWatch",
  "IntelleSettle",
  "Intelle360",
  "IntellePro",
  "IntelleSolve",
];

const DAILY_VOLUME_BUCKETS = [
  "< 0.05",
  "0.05 <> 0.10",
  "0.10 <> 0.25",
  "0.25 <> 0.50",
  "0.50 <> 0.75",
  "0.75 <> 1.00",
  "1.00 <> 1.50",
  "1.50 <> 2.00",
  "2.00 <> 3.00",
  "> 3.00",
];

const INR_FEE_OPTIONS = rangeSteps(0.01, 1.5, 0.01, 2);
const USD_FEE_OPTIONS = rangeSteps(0.001, 0.05, 0.001, 3);
const INR_MMGF_LACS = rangeSteps(1, 10, 0.25, 2);
const USD_MMGF_K = Array.from({ length: 48 }, (_, i) => String(3 + i)); // 3..50

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
  const geography: string | undefined = meta.geography || meta.client_geography;
  if (!geography) return true;
  return String(geography).toLowerCase() === "domestic";
}

interface Props {
  initial?: any;
  offeringId?: number;
}
export default function BusinessOfferings({ initial, offeringId }: Props = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("offerings");

  const [formA, setFormA] = useState({
    clientId: "",
    solution: "",
    product: "",
    avgFee: "",
    mmgf: "",
  });

  const [formB, setFormB] = useState({
    clientStatus: "",
    offeringDescription: "",
    currentDailyVolume: "",
    projectedDailyVolume: "",
    potentialMMGF: "",
    potentialFee: "",
    potentialMRR: "",
    currentPotentialARR: "",
    projectedPotentialARR: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial) {
      setFormA({
        clientId: initial.client_id ? String(initial.client_id) : "",
        solution: initial.solution || "",
        product: initial.product || "",
        avgFee:
          initial.avg_fee_value != null ? String(initial.avg_fee_value) : "",
        mmgf: initial.mmgf_value != null ? String(initial.mmgf_value) : "",
      });
      setFormB({
        clientStatus: initial.client_status || "",
        offeringDescription: initial.offering_description || "",
        currentDailyVolume: initial.current_daily_volume_bucket || "",
        projectedDailyVolume: initial.projected_daily_volume_bucket || "",
        potentialMMGF:
          initial.potential_mmgf_value != null
            ? String(initial.potential_mmgf_value)
            : "",
        potentialFee:
          initial.potential_fee_value != null
            ? String(initial.potential_fee_value)
            : "",
        potentialMRR:
          initial.potential_mrr_lacs != null
            ? String(initial.potential_mrr_lacs)
            : "",
        currentPotentialARR:
          initial.current_potential_arr_usd_mn != null
            ? String(initial.current_potential_arr_usd_mn)
            : "",
        projectedPotentialARR:
          initial.projected_potential_arr_usd_mn != null
            ? String(initial.projected_potential_arr_usd_mn)
            : "",
      });
    }
  }, [initial]);

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients-all"],
    queryFn: async () => {
      const res = await apiClient.getClients();
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60000,
  });

  const clientMap = useMemo(() => {
    const m = new Map<string, any>();
    (clients || []).forEach((c: any) => m.set(String(c.id), c));
    return m;
  }, [clients]);

  const { data: freshClient } = useQuery({
    queryKey: ["client", formA.clientId],
    queryFn: async () =>
      formA.clientId ? apiClient.getClient(Number(formA.clientId)) : null,
    enabled: !!formA.clientId,
    staleTime: 0,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });

  const selectedClient = freshClient || clientMap.get(formA.clientId);
  const domesticA = isDomesticByGeography(selectedClient);
  const domesticB = isDomesticByGeography(selectedClient);

  const USD_TO_INR_RATE = 87; // conversion rate for USD -> INR

  function parseVolumeBucketToMn(bucket: string): number {
    if (!bucket) return 0;
    const nums = (bucket.match(/\d+(?:\.\d+)?/g) || []).map((s) =>
      parseFloat(s),
    );
    if (nums.length >= 2) return (nums[0] + nums[1]) / 2; // average when range
    if (nums.length === 1) return nums[0];
    return 0;
  }

  // Auto-calc Potential MRR (INR Lacs)
  useEffect(() => {
    const volMn = parseVolumeBucketToMn(formB.currentDailyVolume);
    const fee = parseFloat(formA.avgFee || "");
    if (!volMn || isNaN(fee)) {
      setFormB((p) => ({ ...p, potentialMRR: "" }));
      return;
    }
    // daily volume (in millions) -> absolute units
    const daily = volMn * 1_000_000;
    const monthly = daily * 30;
    const feeInINR = domesticB ? fee : fee * USD_TO_INR_RATE;
    const monthlyRevenueINR = monthly * feeInINR;
    const mrrLacs = monthlyRevenueINR / 100_000; // convert to INR Lakhs
    const value = Number.isFinite(mrrLacs)
      ? Number(mrrLacs.toFixed(2)).toString()
      : "";
    setFormB((p) => ({ ...p, potentialMRR: value }));
  }, [formB.currentDailyVolume, formA.avgFee, domesticB]);

  // Normalize fee/MMGF values to match combobox item formats on edit/view (depends on selectedClient)
  useEffect(() => {
    if (!initial) return;
    const dom = isDomesticByGeography(selectedClient);
    const fmt = (n: any, decimals: number) => {
      const v = parseFloat(n);
      return isNaN(v) ? "" : v.toFixed(decimals);
    };
    setFormA((p) => ({
      ...p,
      avgFee: p.avgFee ? (dom ? fmt(p.avgFee, 2) : fmt(p.avgFee, 3)) : p.avgFee,
      mmgf: p.mmgf
        ? dom
          ? fmt(p.mmgf, 2)
          : String(Math.round(parseFloat(p.mmgf)))
        : p.mmgf,
    }));
    setFormB((p) => ({
      ...p,
      potentialMMGF: p.potentialMMGF
        ? dom
          ? fmt(p.potentialMMGF, 2)
          : String(Math.round(parseFloat(p.potentialMMGF)))
        : p.potentialMMGF,
      potentialFee: p.potentialFee
        ? dom
          ? fmt(p.potentialFee, 2)
          : fmt(p.potentialFee, 3)
        : p.potentialFee,
    }));
  }, [selectedClient, initial]);

  const validateA = () => {
    const n: Record<string, string> = {};
    if (!formA.clientId) n.clientIdA = "Client is required";
    if (!formA.solution) n.solution = "Solution is required";
    if (!formA.product) n.product = "Product is required";
    if (!formA.avgFee) n.avgFee = "Average fee is required";
    if (!formA.mmgf) n.mmgf = "MMGF is required";
    setErrors((e) => ({ ...e, ...n }));
    if (Object.keys(n).length) setActiveTab("offerings");
    return Object.keys(n).length === 0;
  };

  const validateB = () => {
    const n: Record<string, string> = {};
    if (!formB.clientStatus) n.clientStatus = "Client Status is required";
    if (!formB.currentDailyVolume)
      n.currentDailyVolume = "Current Daily Volume is required";
    if (!formB.projectedDailyVolume)
      n.projectedDailyVolume = "Projected Daily Volume is required";
    if (!formB.potentialMMGF) n.potentialMMGF = "Potential MMGF is required";
    if (!formB.potentialFee) n.potentialFee = "Potential Fee is required";
    if (!formB.potentialMRR) n.potentialMRR = "Potential MRR is required";
    if (!formB.currentPotentialARR)
      n.currentPotentialARR = "Current Potential ARR is required";
    if (!formB.projectedPotentialARR)
      n.projectedPotentialARR = "Projected Potential ARR is required";
    setErrors((e) => ({ ...e, ...n }));
    if (Object.keys(n).length) setActiveTab("queue");
    return Object.keys(n).length === 0;
  };

  const onSubmit = async () => {
    const okA = validateA();
    const okB = validateB();
    if (!okA || !okB) return;
    const currency = domesticA ? "INR" : "USD";
    const unit = domesticA ? "Lacs" : "K";
    const payload = {
      client_id: formA.clientId ? Number(formA.clientId) : null,
      solution: formA.solution || null,
      product: formA.product || null,
      avg_fee_value: formA.avgFee ? Number(formA.avgFee) : null,
      avg_fee_currency: currency,
      mmgf_value: formA.mmgf ? Number(formA.mmgf) : null,
      mmgf_unit: unit,
      client_status: formB.clientStatus || null,
      offering_description: formB.offeringDescription || null,
      current_daily_volume_bucket: formB.currentDailyVolume || null,
      projected_daily_volume_bucket: formB.projectedDailyVolume || null,
      potential_mmgf_value: formB.potentialMMGF
        ? Number(formB.potentialMMGF)
        : null,
      potential_mmgf_unit: unit,
      potential_fee_value: formB.potentialFee
        ? Number(formB.potentialFee)
        : null,
      potential_fee_currency: currency,
      potential_mrr_lacs: formB.potentialMRR
        ? Number(formB.potentialMRR)
        : null,
      current_potential_arr_usd_mn: formB.currentPotentialARR
        ? Number(formB.currentPotentialARR)
        : null,
      projected_potential_arr_usd_mn: formB.projectedPotentialARR
        ? Number(formB.projectedPotentialARR)
        : null,
      template_id: 6,
      created_by: user ? Number(user.id) : null,
      updated_by: user ? Number(user.id) : null,
    } as any;

    try {
      if (offeringId) {
        await apiClient.updateBusinessOffering(offeringId, payload);
      } else {
        await apiClient.createBusinessOffering(payload);
      }
      toast({ title: "Saved", description: "Business Offerings saved." });
      navigate("/business-offerings");
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Failed",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-7 h-7 text-blue-600" /> Business Offerings
            </h1>
            <p className="text-gray-600">
              Record offerings and client pipeline
            </p>
          </div>
        </div>
        <Button onClick={onSubmit}>Save</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="offerings">
            Mylapay Business Offerings
          </TabsTrigger>
          <TabsTrigger value="queue">Client Status Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="offerings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Offering Details</CardTitle>
              <CardDescription>
                Fill in the required information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Client *</Label>
                  <Select
                    value={formA.clientId}
                    onValueChange={(v) => {
                      setFormA((p) => ({
                        ...p,
                        clientId: v,
                        avgFee: "",
                        mmgf: "",
                      }));
                      setErrors((e) => ({ ...e, clientIdA: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          clientsLoading ? "Loading..." : "Select client"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(clients || []).map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.client_name} {c.country ? `(${c.country})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.clientIdA && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.clientIdA}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Solutions *</Label>
                  <Select
                    value={formA.solution}
                    onValueChange={(v) => {
                      setFormA((p) => ({ ...p, solution: v }));
                      setErrors((e) => ({ ...e, solution: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select solution" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOLUTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.solution && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.solution}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Products *</Label>
                  <Select
                    value={formA.product}
                    onValueChange={(v) => {
                      setFormA((p) => ({ ...p, product: v }));
                      setErrors((e) => ({ ...e, product: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCTS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.product && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.product}
                    </div>
                  )}
                </div>

                <div>
                  <Label>
                    {domesticA
                      ? "Avg. Per txn fee INR"
                      : "Avg. Per txn fee USD"}{" "}
                    *
                  </Label>
                  <Combobox
                    items={(domesticA ? INR_FEE_OPTIONS : USD_FEE_OPTIONS).map(
                      (v) => ({ label: v, value: v }),
                    )}
                    value={formA.avgFee}
                    onChange={(v) => {
                      setFormA((p) => ({ ...p, avgFee: v }));
                      setErrors((e) => ({ ...e, avgFee: "" }));
                    }}
                    placeholder={
                      formA.clientId
                        ? "Search or select"
                        : "Select client first"
                    }
                    disabled={!formA.clientId}
                  />
                  {errors.avgFee && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.avgFee}
                    </div>
                  )}
                </div>

                <div>
                  <Label>
                    {domesticA ? "MMGF INR in Lacs" : "MMGF USD in K"} *
                  </Label>
                  <Combobox
                    items={(domesticA ? INR_MMGF_LACS : USD_MMGF_K).map(
                      (v) => ({ label: v, value: v }),
                    )}
                    value={formA.mmgf}
                    onChange={(v) => {
                      setFormA((p) => ({ ...p, mmgf: v }));
                      setErrors((e) => ({ ...e, mmgf: "" }));
                    }}
                    placeholder={
                      formA.clientId
                        ? "Search or select"
                        : "Select client first"
                    }
                    disabled={!formA.clientId}
                  />
                  {errors.mmgf && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.mmgf}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (validateA()) setActiveTab("queue");
              }}
            >
              Next
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client Status Queue</CardTitle>
              <CardDescription>
                Capture client pipeline and projections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Client Status *</Label>
                  <Select
                    value={formB.clientStatus}
                    onValueChange={(v) => {
                      setFormB((p) => ({ ...p, clientStatus: v }));
                      setErrors((e) => ({ ...e, clientStatus: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "Pass",
                        "WIP",
                        "Deal Closed",
                        "Yet to Connect",
                        "Future Potential",
                      ].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.clientStatus && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.clientStatus}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <Label>Offering Description</Label>
                  <Textarea
                    value={formB.offeringDescription}
                    onChange={(e) =>
                      setFormB((p) => ({
                        ...p,
                        offeringDescription: e.target.value,
                      }))
                    }
                    placeholder="Describe the offering"
                  />
                </div>

                <div>
                  <Label>Current Daily Txn Volume Mn *</Label>
                  <Select
                    value={formB.currentDailyVolume}
                    onValueChange={(v) => {
                      setFormB((p) => ({ ...p, currentDailyVolume: v }));
                      setErrors((e) => ({ ...e, currentDailyVolume: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {DAILY_VOLUME_BUCKETS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.currentDailyVolume && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.currentDailyVolume}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Projected Daily Volume Mn - next 2 years *</Label>
                  <Select
                    value={formB.projectedDailyVolume}
                    onValueChange={(v) => {
                      setFormB((p) => ({ ...p, projectedDailyVolume: v }));
                      setErrors((e) => ({ ...e, projectedDailyVolume: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {DAILY_VOLUME_BUCKETS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.projectedDailyVolume && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.projectedDailyVolume}
                    </div>
                  )}
                </div>

                <div>
                  <Label>
                    {domesticB
                      ? "Potential MMGF INR in Lacs"
                      : "Potential MMGF USD in K"}{" "}
                    *
                  </Label>
                  <Combobox
                    items={(domesticB ? INR_MMGF_LACS : USD_MMGF_K).map(
                      (v) => ({ label: v, value: v }),
                    )}
                    value={formB.potentialMMGF}
                    onChange={(v) => {
                      setFormB((p) => ({ ...p, potentialMMGF: v }));
                      setErrors((e) => ({ ...e, potentialMMGF: "" }));
                    }}
                    placeholder={
                      formA.clientId
                        ? "Search or select"
                        : "Select client in Offering Details"
                    }
                    disabled={!formA.clientId}
                  />
                  {errors.potentialMMGF && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.potentialMMGF}
                    </div>
                  )}
                </div>

                <div>
                  <Label>
                    {domesticB
                      ? "Potential Fee per Txn INR"
                      : "Potential Fee per Txn USD"}{" "}
                    *
                  </Label>
                  <Combobox
                    items={(domesticB ? INR_FEE_OPTIONS : USD_FEE_OPTIONS).map(
                      (v) => ({ label: v, value: v }),
                    )}
                    value={formB.potentialFee}
                    onChange={(v) => {
                      setFormB((p) => ({ ...p, potentialFee: v }));
                      setErrors((e) => ({ ...e, potentialFee: "" }));
                    }}
                    placeholder={
                      formA.clientId
                        ? "Search or select"
                        : "Select client in Offering Details"
                    }
                    disabled={!formA.clientId}
                  />
                  {errors.potentialFee && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.potentialFee}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Potential MRR (INR Lacs) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formB.potentialMRR}
                    readOnly
                    disabled
                    className="bg-gray-50"
                    placeholder="Auto-calculated"
                  />
                  {errors.potentialMRR && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.potentialMRR}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Current Potential ARR (USD Mn) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formB.currentPotentialARR}
                    onChange={(e) => {
                      setFormB((p) => ({
                        ...p,
                        currentPotentialARR: e.target.value,
                      }));
                      setErrors((er) => ({ ...er, currentPotentialARR: "" }));
                    }}
                    placeholder="e.g., 0.50"
                  />
                  {errors.currentPotentialARR && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.currentPotentialARR}
                    </div>
                  )}
                </div>

                <div>
                  <Label>
                    Projected Potential ARR (USD Mn) - next 2 years *
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formB.projectedPotentialARR}
                    onChange={(e) => {
                      setFormB((p) => ({
                        ...p,
                        projectedPotentialARR: e.target.value,
                      }));
                      setErrors((er) => ({ ...er, projectedPotentialARR: "" }));
                    }}
                    placeholder="e.g., 1.00"
                  />
                  {errors.projectedPotentialARR && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.projectedPotentialARR}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setActiveTab("offerings")}>
              Previous
            </Button>
            <Button onClick={onSubmit}>Save</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Combobox({
  items,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  items: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          disabled={disabled}
        >
          {selected ? selected.label : placeholder || "Select..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={placeholder || "Search..."} />
          <CommandEmpty>No results</CommandEmpty>
          <CommandList>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.label}
                  onSelect={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      item.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
