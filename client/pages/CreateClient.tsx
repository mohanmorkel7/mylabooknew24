import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Country, State, City } from "country-state-city";
import { Plus, Minus, Save, ArrowLeft, Building2, User, Mail, Phone, Globe, MapPin, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const SOURCES = [
  "LinkedIn - Outbound",
  "LinkedIn - Inbound",
  "Email - Outbound",
  "Email - Inbound",
  "Call - Outbound",
  "Call - Inbound",
  "Existing Client",
  "Business Team",
  "Reference",
  "General List",
];

const CLIENT_TYPES = [
  "PA-PG",
  "POS Provider",
  "PG-Bank",
  "BIN-Bank",
  "Strategic Partnership",
  "Other Acquirers",
];

const PAYMENT_OFFERINGS = [
  "Online Payments",
  "Offline Payment",
  "UPI Payments",
];

const GEOGRAPHY = ["Domestic", "International"] as const;

const TXN_VOLUMES = [
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function CreateClient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("client-info");

  const [clientInfo, setClientInfo] = useState({
    source: "",
    source_value: "",
    client_name: "",
    client_type: "",
    payment_offerings: [] as string[],
    website: "",
    geography: "" as "Domestic" | "International" | "",
    txn_volume: "",
    product_tag_info: "",
  });

  const [contacts, setContacts] = useState<Array<{
    contact_name: string;
    designation: string;
    phone_prefix?: string;
    phone: string;
    email: string;
  }>>([
    { contact_name: "", designation: "", phone_prefix: "+91", phone: "", email: "" },
  ]);

  const [addressInfo, setAddressInfo] = useState({
    address: "",
    country: "",
    state: "",
    city: "",
  });

  const countries = Country.getAllCountries();
  const selectedCountry = countries.find((c) => c.name === addressInfo.country);
  const states = selectedCountry ? State.getStatesOfCountry(selectedCountry.isoCode) : [];
  const selectedState = states.find((s) => s.name === addressInfo.state);
  const cities = selectedCountry
    ? selectedState
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : City.getCitiesOfCountry(selectedCountry.isoCode)
    : [];
  const uniqueCities = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; stateCode?: string }[] = [];
    for (const ct of cities as any[]) {
      const val = `${ct.name}__${ct.stateCode || ""}`;
      if (!seen.has(val)) {
        seen.add(val);
        out.push({ name: ct.name, stateCode: ct.stateCode });
      }
    }
    return out;
  }, [JSON.stringify(cities)]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!clientInfo.source) e.source = "Required";
    if (!clientInfo.client_name.trim()) e.client_name = "Required";
    if (clientInfo.payment_offerings.length === 0) e.payment_offerings = "Select at least one";
    if (!clientInfo.geography) e.geography = "Required";
    if (!clientInfo.txn_volume) e.txn_volume = "Required";
    if (!clientInfo.product_tag_info.trim()) e.product_tag_info = "Required";
    if (!addressInfo.country) e.country = "Required";
    if (!addressInfo.state) e.state = "Required";
    if (!addressInfo.city) e.city = "Required";
    return e;
  }, [clientInfo, addressInfo]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const primary = contacts[0] || { contact_name: "", email: "", phone: "", phone_prefix: "+91", designation: "" };
      if (!primary.contact_name || !isValidEmail(primary.email)) {
        toast({
          title: "Missing contact",
          description:
            "Contact name and email are currently required to create a client. We can make them optional if backend validation is updated.",
          variant: "destructive",
        });
        throw new Error("Contact details required by backend");
      }

      const cityName = addressInfo.city ? addressInfo.city.split("__")[0].split("-")[0] : "";
      const payload: any = {
        client_name: clientInfo.client_name.trim(),
        contact_person: primary.contact_name.trim(),
        email: primary.email.trim(),
        phone: primary.phone?.trim() || undefined,
        notes: JSON.stringify({
          source: clientInfo.source,
          client_type: clientInfo.client_type || undefined,
          payment_offerings: clientInfo.payment_offerings,
          website: clientInfo.website || undefined,
          geography: clientInfo.geography,
          txn_volume: clientInfo.txn_volume,
          product_tag_info: clientInfo.product_tag_info,
          source_value: clientInfo.source_value || undefined,
          contacts,
          address: addressInfo.address || undefined,
          country: addressInfo.country,
          state: addressInfo.state,
          city: cityName,
        }),
        status: "active",
      };
      const res = await apiClient.request("/clients", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-stats"] });
      toast({ title: "Client created", description: "Client has been created successfully." });
      navigate("/clients");
    },
    onError: (err: any) => {
      if (err?.message) {
        toast({ title: "Create failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      toast({ title: "Validation error", description: "Please fill all required fields", variant: "destructive" });
      if (errors.country || errors.state || errors.city) setActiveTab("contact-info");
      else setActiveTab("client-info");
      return;
    }
    createMutation.mutate();
  };

  const updateContact = (idx: number, key: string, value: string) => {
    setContacts((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));
  };

  const addContact = () =>
    setContacts((prev) => [
      ...prev,
      { contact_name: "", designation: "", phone_prefix: "+91", phone: "", email: "" },
    ]);
  const removeContact = (idx: number) => setContacts((prev) => prev.filter((_, i) => i !== idx));

  // Simple searchable combobox component
  function Combobox({ items, value, onChange, placeholder, disabled }: { items: { label: string; value: string }[]; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
    const [open, setOpen] = React.useState(false);
    const selected = items.find((i) => i.value === value);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between", disabled && "opacity-50 cursor-not-allowed")} disabled={disabled}>
            {selected ? selected.label : (placeholder || "Select...")}
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
                  <CommandItem key={`${item.value}`} value={item.label} onSelect={() => { onChange(item.value); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", item.value === value ? "opacity-100" : "opacity-0")} />
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate("/clients")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Clients
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Client</h1>
          <p className="text-gray-600 mt-1">Add a new client with company and contact details</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="client-info">Client Info</TabsTrigger>
            <TabsTrigger value="contact-info">Client Contact Info</TabsTrigger>
          </TabsList>

          <TabsContent value="client-info" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" /> Client Information
                </CardTitle>
                <CardDescription>Fill basic client details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <Label>Source *</Label>
                    <Select
                      value={clientInfo.source}
                      onValueChange={(v) => setClientInfo((p) => ({ ...p, source: v, source_value: "" }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.source && <p className="text-red-600 text-xs mt-1">{errors.source}</p>}
                  </div>
                  {clientInfo.source && (() => {
                    const src = clientInfo.source;
                    const meta = (() => {
                      if (src.startsWith("Email"))
                        return { label: "Email ID", placeholder: "name@company.com", type: "email" as const };
                      if (src.startsWith("Call"))
                        return { label: "Phone Number", placeholder: "+91 98765 43210", type: "tel" as const };
                      if (src.startsWith("LinkedIn"))
                        return { label: "LinkedIn Profile URL", placeholder: "https://linkedin.com/in/...", type: "url" as const };
                      if (src === "Existing Client")
                        return { label: "Existing Client Name/ID", placeholder: "Enter client name or ID", type: "text" as const };
                      if (src === "Business Team")
                        return { label: "Team Member Name", placeholder: "Enter internal team member name", type: "text" as const };
                      if (src === "Reference")
                        return { label: "Reference Person", placeholder: "Enter reference person's name or contact", type: "text" as const };
                      if (src === "General List")
                        return { label: "List Name/Link", placeholder: "Enter list name or link", type: "text" as const };
                      return { label: "Source Information", placeholder: "Provide details for the selected source", type: "text" as const };
                    })();
                    return (
                      <div>
                        <Label>{meta.label}</Label>
                        <Input
                          type={meta.type}
                          value={clientInfo.source_value}
                          onChange={(e) => setClientInfo((p) => ({ ...p, source_value: e.target.value }))}
                          placeholder={meta.placeholder}
                        />
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Client Name *</Label>
                    <Input
                      value={clientInfo.client_name}
                      onChange={(e) => setClientInfo((p) => ({ ...p, client_name: e.target.value }))}
                      placeholder="Enter client name"
                    />
                    {errors.client_name && <p className="text-red-600 text-xs mt-1">{errors.client_name}</p>}
                  </div>
                  <div>
                    <Label>Client Type</Label>
                    <Select
                      value={clientInfo.client_type}
                      onValueChange={(v) => setClientInfo((p) => ({ ...p, client_type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Payment Offering (multi-select) *</Label>
                  <MultiSelect
                    options={PAYMENT_OFFERINGS}
                    value={clientInfo.payment_offerings}
                    onChange={(val) => setClientInfo((p) => ({ ...p, payment_offerings: val }))}
                    placeholder="Select payment offerings"
                    className="mt-1"
                  />
                  {errors.payment_offerings && (
                    <p className="text-red-600 text-xs mt-1">{errors.payment_offerings}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        className="pl-10"
                        value={clientInfo.website}
                        onChange={(e) => setClientInfo((p) => ({ ...p, website: e.target.value }))}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Client Geography *</Label>
                    <Select
                      value={clientInfo.geography}
                      onValueChange={(v) => setClientInfo((p) => ({ ...p, geography: v as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select geography" />
                      </SelectTrigger>
                      <SelectContent>
                        {GEOGRAPHY.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.geography && <p className="text-red-600 text-xs mt-1">{errors.geography}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Txn Volume / per day in million *</Label>
                    <Select
                      value={clientInfo.txn_volume}
                      onValueChange={(v) => setClientInfo((p) => ({ ...p, txn_volume: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select volume" />
                      </SelectTrigger>
                      <SelectContent>
                        {TXN_VOLUMES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.txn_volume && <p className="text-red-600 text-xs mt-1">{errors.txn_volume}</p>}
                  </div>
                  <div>
                    <Label>Product Tag Info *</Label>
                    <Input
                      value={clientInfo.product_tag_info}
                      onChange={(e) => setClientInfo((p) => ({ ...p, product_tag_info: e.target.value }))}
                      placeholder="Enter product tags"
                    />
                    {errors.product_tag_info && (
                      <p className="text-red-600 text-xs mt-1">{errors.product_tag_info}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact-info" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" /> Address
                </CardTitle>
                <CardDescription>Address is optional, Country/State/City are mandatory</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Street Address</Label>
                  <Input
                    value={addressInfo.address}
                    onChange={(e) => setAddressInfo((p) => ({ ...p, address: e.target.value }))}
                    placeholder="Building, street, area"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Country *</Label>
                    <Combobox
                      placeholder="Search country..."
                      items={countries.map((c) => ({ label: c.name, value: c.name }))}
                      value={addressInfo.country}
                      onChange={(v) => setAddressInfo((p) => ({ ...p, country: v, state: "", city: "" }))}
                    />
                    {errors.country && <p className="text-red-600 text-xs mt-1">{errors.country}</p>}
                  </div>
                  <div>
                    <Label>State *</Label>
                    <Combobox
                      placeholder="Search state..."
                      items={states.map((s) => ({ label: s.name, value: s.name }))}
                      value={addressInfo.state}
                      onChange={(v) => setAddressInfo((p) => ({ ...p, state: v, city: "" }))}
                      disabled={!selectedCountry}
                    />
                    {errors.state && <p className="text-red-600 text-xs mt-1">{errors.state}</p>}
                  </div>
                  <div>
                    <Label>City *</Label>
                    <Combobox
                      placeholder="Search city..."
                      items={uniqueCities.map((ct, idx) => ({ label: ct.name, value: `${ct.name}__${ct.stateCode || ""}-${idx}` }))}
                      value={addressInfo.city}
                      onChange={(v) => setAddressInfo((p) => ({ ...p, city: v }))}
                      disabled={!selectedCountry}
                    />
                    {errors.city && <p className="text-red-600 text-xs mt-1">{errors.city}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" /> Client Contact Information
                </CardTitle>
                <CardDescription>Primary and additional contacts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {contacts.map((c, idx) => (
                  <div key={idx} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">Contact #{idx + 1}</Badge>
                      {contacts.length > 1 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => removeContact(idx)}>
                          <Minus className="w-4 h-4 mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Contact Name</Label>
                        <Input
                          value={c.contact_name}
                          onChange={(e) => updateContact(idx, "contact_name", e.target.value)}
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <Label>Designation</Label>
                        <Input
                          value={c.designation}
                          onChange={(e) => updateContact(idx, "designation", e.target.value)}
                          placeholder="Job title"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            className="pl-10"
                            value={c.email}
                            onChange={(e) => updateContact(idx, "email", e.target.value)}
                            placeholder="name@company.com"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <div className="flex gap-2">
                          <Select
                            value={c.phone_prefix || "+91"}
                            onValueChange={(v) => updateContact(idx, "phone_prefix", v)}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PHONE_PREFIXES.map((p) => (
                                <SelectItem key={p.code} value={p.code}>
                                  {p.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="relative flex-1">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              className="pl-10"
                              value={c.phone}
                              onChange={(e) => updateContact(idx, "phone", e.target.value)}
                              placeholder="98765 43210"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addContact}>
                  <Plus className="w-4 h-4 mr-1" /> Add Another Contact
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-6 border-t">
          <Button type="button" variant="outline" onClick={() => navigate("/clients")}>Cancel</Button>
          <div className="space-x-3">
            <Button type="submit">
              <Save className="w-4 h-4 mr-2" /> Create Client
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
