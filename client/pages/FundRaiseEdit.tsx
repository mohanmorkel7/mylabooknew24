import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  ArrowLeft,
  Save,
  Calendar,
  DollarSign,
  Building,
  ChevronsUpDown,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "Dropped", label: "Dropped" },
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
];

const ROUND_STAGES = [
  { value: "pre_seed", label: "Pre seed" },
  { value: "seed", label: "Seed" },
  { value: "bridge", label: "Bridge" },
  { value: "pre_series_a", label: "Pre Series A" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
];

const STATUS_TO_SERVER: Record<string, string> = {
  WIP: "in-progress",
  Closed: "completed",
  Dropped: "lost",
};

const SERVER_TO_STATUS: Record<string, string> = {
  "in-progress": "WIP",
  completed: "Closed",
  lost: "Dropped",
};

const INVESTOR_STATUS_OPTIONS = [
  { value: "Pass", label: "Pass" },
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
  { value: "Yet to Connect", label: "Yet to Connect" },
  { value: "Future Potential", label: "Future Potential" },
];

const FUND_MN_OPTIONS = Array.from({ length: 200 }, (_, i) =>
  (0.05 + i * 0.05).toFixed(2),
).filter((v) => parseFloat(v) <= 10);
const VALUATION_MN_OPTIONS = [
  "0.50",
  ...Array.from({ length: 100 }, (_, i) => (i + 1).toFixed(2)),
];

export default function FundRaiseEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fundMnOpen, setFundMnOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    vc_investor: "",
    status: "WIP",
    investor_status: "",
    reason: "",
    round_stage: "",
    start_date: "",
    end_date: "",
    total_raise_mn: "",
    valuation_mn: "",
    fund_mn: "",
    template_id: 1,
  });

  const { data: vcList = [] } = useQuery({
    queryKey: ["vc-list-all"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc");
        return Array.isArray(result) ? result : [];
      } catch (e) {
        return [];
      }
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const investorOptions = useMemo(() => {
    const names = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    (vcList || []).forEach((vc: any) => {
      const name = vc.investor_name?.trim();
      if (name && !names.has(name)) {
        names.add(name);
        opts.push({ value: name, label: name });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [vcList]);

  const { data: current, isLoading } = useQuery({
    queryKey: ["fundraise-edit", id],
    queryFn: async () => apiClient.request(`/fund-raises/${id}`),
    enabled: !!id,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  useEffect(() => {
    if (!current) return;
    setForm({
      vc_investor: current.investor_name || "",
      status: SERVER_TO_STATUS[current.status] || "WIP",
      investor_status: current.investor_status || "",
      reason: current.reason || "",
      round_stage: current.round_stage || "",
      start_date: current.start_date
        ? new Date(current.start_date).toISOString().split("T")[0]
        : "",
      end_date: current.targeted_end_date
        ? new Date(current.targeted_end_date).toISOString().split("T")[0]
        : "",
      total_raise_mn: current.total_raise_mn || current.round_size || "",
      valuation_mn: current.valuation_mn || current.valuation || "",
      fund_mn: current.fund_mn || "",
      template_id: current.template_id || 1,
    });
  }, [current]);

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiClient.request(`/fund-raises/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fund-raises"] });
      await queryClient.invalidateQueries({ queryKey: ["fundraise", id] });
      await queryClient.invalidateQueries({ queryKey: ["fundraise-edit", id] });
      await queryClient.invalidateQueries({
        queryKey: ["fund-raise-steps", id],
      });
      await queryClient.refetchQueries({ queryKey: ["fundraise", id] });
      await queryClient.refetchQueries({ queryKey: ["fundraise-edit", id] });
      await queryClient.refetchQueries({ queryKey: ["fund-raise-steps", id] });
    },
  });

  const handleChange = (field: string, value: any) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  };

  const handleSubmit = async () => {
    const payload: any = {
      investor_name: form.vc_investor,
      ui_status: form.status,
      round_stage: form.round_stage,
      total_raise_mn: form.total_raise_mn,
      valuation_mn: form.valuation_mn,
      fund_mn: form.fund_mn,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      reason: form.reason,
      investor_status: form.investor_status || null,
      template_id: form.template_id || 1,
      updated_by: parseInt(user?.id || "1"),
    };
    try {
      await updateMutation.mutateAsync(payload);
      await queryClient.invalidateQueries({ queryKey: ["fundraise", id] });
      await queryClient.invalidateQueries({ queryKey: ["fundraise-edit", id] });
      await queryClient.invalidateQueries({
        queryKey: ["fund-raise-steps", id],
      });
      await queryClient.refetchQueries({ queryKey: ["fundraise", id] });
      await queryClient.refetchQueries({ queryKey: ["fundraise-edit", id] });
      await queryClient.refetchQueries({ queryKey: ["fund-raise-steps", id] });
      navigate(`/fundraise/${id}`);
    } catch (e) {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading Fund Raise...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/fundraise/${id}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Overview
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Edit Fund Raise
            </h1>
            <p className="text-gray-600">Update fund raise details</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="fundraise">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="fundraise">Fund Raise</TabsTrigger>
          <TabsTrigger value="queue">Investor Status Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="fundraise" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fund Raise Details</CardTitle>
              <CardDescription>Edit the information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>VC</Label>
                  <Select
                    value={form.vc_investor}
                    onValueChange={(v) => handleChange("vc_investor", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select VC" />
                    </SelectTrigger>
                    <SelectContent>
                      {investorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4" /> {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => handleChange("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Investor Status</Label>
                  <Select
                    value={form.investor_status}
                    onValueChange={(v) => handleChange("investor_status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Investor Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {INVESTOR_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Investment Stage</Label>
                  <Select
                    value={form.round_stage}
                    onValueChange={(v) => handleChange("round_stage", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUND_STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Start Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      className="pl-10"
                      value={form.start_date}
                      onChange={(e) =>
                        handleChange("start_date", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>End Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      className="pl-10"
                      value={form.end_date}
                      onChange={(e) => handleChange("end_date", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Total Fund Raise $ Mn</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {form.total_raise_mn || "Select amount"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      avoidCollisions={true}
                      collisionPadding={8}
                      className="p-0 w-[240px] max-h-[min(50vh,320px)] overflow-auto"
                    >
                      <Command>
                        <CommandInput placeholder="Search amount..." />
                        <CommandList>
                          <CommandEmpty>No amounts found.</CommandEmpty>
                          <CommandGroup>
                            {FUND_MN_OPTIONS.map((v) => (
                              <CommandItem
                                key={v}
                                value={v}
                                onSelect={(val) =>
                                  handleChange("total_raise_mn", val)
                                }
                              >
                                {v}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Valuation $ Mn</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {form.valuation_mn || "Select valuation"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      avoidCollisions={true}
                      collisionPadding={8}
                      className="p-0 w-[240px] max-h-[min(50vh,320px)] overflow-auto"
                    >
                      <Command>
                        <CommandInput placeholder="Search valuation..." />
                        <CommandList>
                          <CommandEmpty>No valuations found.</CommandEmpty>
                          <CommandGroup>
                            {VALUATION_MN_OPTIONS.map((v) => (
                              <CommandItem
                                key={v}
                                value={v}
                                onSelect={(val) =>
                                  handleChange("valuation_mn", val)
                                }
                              >
                                {v}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div>
                <Label>Reason</Label>
                <Textarea
                  placeholder="Add details/reason"
                  value={form.reason}
                  onChange={(e) => handleChange("reason", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle>Investor Status Queue</CardTitle>
              <CardDescription>Quickly update key fields</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Fund $ Mn</Label>
                <Popover open={fundMnOpen} onOpenChange={setFundMnOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                    >
                      {form.fund_mn || "Select amount"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    avoidCollisions={true}
                    collisionPadding={8}
                    className="p-0 w-[240px] max-h-[min(50vh,320px)] overflow-auto"
                  >
                    <Command>
                      <CommandInput placeholder="Search amount..." />
                      <CommandList>
                        <CommandEmpty>No amounts found.</CommandEmpty>
                        <CommandGroup>
                          {FUND_MN_OPTIONS.map((v) => (
                            <CommandItem
                              key={v}
                              value={v}
                              onSelect={(val) => {
                                handleChange("fund_mn", val);
                                setFundMnOpen(false);
                              }}
                            >
                              {v}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Investor Status</Label>
                <Select
                  value={form.investor_status}
                  onValueChange={(v) => handleChange("investor_status", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Investor Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVESTOR_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
