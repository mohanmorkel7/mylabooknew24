import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Country, State, City } from "country-state-city";
import { Trash2, Edit, Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CONNECTION_TYPES = [
  "Business Team",
  "Internal Team",
  "VC",
  "Advisory Board",
  "Consultants",
  "General",
] as const;

const PHONE_PREFIXES = [
  { code: "+1", label: "+1 (US)" },
  { code: "+44", label: "+44 (UK)" },
  { code: "+91", label: "+91 (IN)" },
  { code: "+971", label: "+971 (UAE)" },
  { code: "+61", label: "+61 (AU)" },
  { code: "+65", label: "+65 (SG)" },
  { code: "+81", label: "+81 (JP)" },
  { code: "+49", label: "+49 (DE)" },
];

type ConnectionType = (typeof CONNECTION_TYPES)[number];

type Connection = {
  id: number;
  name: string;
  type: ConnectionType | null;
  phone_prefix: string;
  phone: string;
  email?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  created_at?: string;
  updated_at?: string;
};

function useConnections(filters: { q?: string; type?: string }) {
  return useQuery({
    queryKey: ["connections", filters],
    queryFn: () => apiClient.getConnections(filters),
  });
}

function ConnectionForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Connection>;
  onSubmit: (data: Partial<Connection>) => void;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<Partial<Connection>>({
    name: initial?.name || "",
    type: (initial?.type as ConnectionType) || null,
    phone_prefix: initial?.phone_prefix || "+91",
    phone: initial?.phone || "",
    email: initial?.email || "",
    country: initial?.country || "",
    state: initial?.state || "",
    city: initial?.city || "",
  });

  const countries = Country.getAllCountries();
  const selectedCountry = countries.find((c) => c.name === form.country);
  const states = selectedCountry
    ? State.getStatesOfCountry(selectedCountry.isoCode)
    : [];
  const selectedState = states.find((s) => s.name === form.state);
  const cities = selectedCountry
    ? selectedState
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : City.getCitiesOfCountry(selectedCountry.isoCode)
    : [];

  function submit() {
    const missing: string[] = [];
    if (!form.name || !String(form.name).trim()) missing.push("name");
    if (!form.phone_prefix || !String(form.phone_prefix).trim())
      missing.push("phone_prefix");
    if (!form.phone || !String(form.phone).trim()) missing.push("phone");
    if (missing.length) {
      toast({
        title: "Missing required",
        description: `Please fill: ${missing.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    onSubmit({
      name: String(form.name).trim(),
      type: form.type || null,
      phone_prefix: String(form.phone_prefix).trim(),
      phone: String(form.phone).trim(),
      email: form.email ? String(form.email).trim() : null,
      country: form.country ? String(form.country).trim() : null,
      state: form.state ? String(form.state).trim() : null,
      city: form.city ? String(form.city).trim() : null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Name *</Label>
          <Input
            value={form.name as string}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Member name"
          />
        </div>
        <div>
          <Label>Type</Label>
          <Select
            value={form.type || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, type: v as any }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {CONNECTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Phone Prefix *</Label>
          <Select
            value={form.phone_prefix}
            onValueChange={(v) => setForm((f) => ({ ...f, phone_prefix: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select prefix" />
            </SelectTrigger>
            <SelectContent>
              {PHONE_PREFIXES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Phone *</Label>
          <Input
            value={form.phone as string}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Phone number"
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={(form.email as string) || ""}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="name@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Country</Label>
          <Select
            value={form.country || undefined}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, country: v, state: "", city: "" }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.isoCode} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>State</Label>
          <Select
            value={form.state || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, state: v, city: "" }))}
            disabled={!selectedCountry}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.isoCode} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>City</Label>
          <Select
            value={form.city || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, city: v }))}
            disabled={!selectedCountry}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={`${c.name}-${c.stateCode || ""}`} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
        )}
        <Button onClick={submit}>Save</Button>
      </div>
    </div>
  );
}

export default function Connections() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Connection | null>(null);

  const { data: connections = [], refetch, isLoading } = useConnections({
    q: search ? search : undefined,
    type: typeFilter && typeFilter !== "all" ? typeFilter : undefined,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Connection>) => apiClient.createConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast({ title: "Saved", description: "Connection created" });
      setDialogOpen(false);
    },
    onError: (e: any) => {
      toast({ title: "Create failed", description: String(e?.message), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: Partial<Connection> }) =>
      apiClient.updateConnection(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast({ title: "Updated", description: "Changes saved" });
      setEditing(null);
      setDialogOpen(false);
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: String(e?.message), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast({ title: "Deleted", description: "Connection removed" });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: String(e?.message), variant: "destructive" });
    },
  });

  function handleCreate(data: Partial<Connection>) {
    createMutation.mutate(data);
  }

  function handleUpdate(data: Partial<Connection>) {
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, data });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="text-sm text-gray-500">Manage your members and contacts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Add member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit member" : "Add member"}</DialogTitle>
            </DialogHeader>
            <ConnectionForm
              initial={editing || undefined}
              onSubmit={editing ? handleUpdate : handleCreate}
              onCancel={() => { setDialogOpen(false); setEditing(null); }}
            />
            <DialogFooter />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search & Filters</CardTitle>
          <CardDescription>Find connections by name, email, phone and type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search connections"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => refetch()}>Search</Button>
            </div>
            <div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {CONNECTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && (
          <div className="col-span-full text-center text-sm text-gray-500">Loading...</div>
        )}
        {!isLoading && connections.length === 0 && (
          <div className="col-span-full text-center text-sm text-gray-500">No connections found</div>
        )}
        {connections.map((c: Connection) => (
          <Card key={c.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{c.name}</CardTitle>
                {c.type && <Badge variant="secondary">{c.type}</Badge>}
              </div>
              <CardDescription>
                {(c.city ? c.city + ", " : "")}
                {(c.state ? c.state + ", " : "")}
                {(c.country || "")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-gray-500">Phone:</span> {c.phone_prefix} {c.phone}
                </div>
                {c.email && (
                  <div>
                    <span className="text-gray-500">Email:</span> {c.email}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(c);
                    setDialogOpen(true);
                  }}
                >
                  <Edit className="w-4 h-4 mr-1" /> Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete this connection?")) {
                      deleteMutation.mutate(c.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
