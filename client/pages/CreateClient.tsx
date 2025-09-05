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
import { Plus, Minus, Save, ArrowLeft, Building2, User, Mail, Phone, Globe } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function CreateClient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("client-info");

  const [clientInfo, setClientInfo] = useState({
    source: "",
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
    phone: string;
    email: string;
    linkedin: string;
  }>>([
    { contact_name: "", designation: "", phone: "", email: "", linkedin: "" },
  ]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!clientInfo.source) e.source = "Required";
    if (!clientInfo.client_name.trim()) e.client_name = "Required";
    if (clientInfo.payment_offerings.length === 0) e.payment_offerings = "Select at least one";
    if (!clientInfo.geography) e.geography = "Required";
    if (!clientInfo.txn_volume) e.txn_volume = "Required";
    if (!clientInfo.product_tag_info.trim()) e.product_tag_info = "Required";
    // contact required for POST schema
    const primary = contacts[0];
    if (!primary || !primary.contact_name.trim()) e.primary_contact_name = "Required";
    if (!primary || !isValidEmail(primary.email)) e.primary_contact_email = "Valid email required";
    return e;
  }, [clientInfo, contacts]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const primary = contacts[0];
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
          contacts,
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
      toast({ title: "Create failed", description: err?.message || "Failed to create client", variant: "destructive" });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      toast({ title: "Validation error", description: "Please fill all required fields", variant: "destructive" });
      // move to the tab with first error
      if (errors.primary_contact_email || errors.primary_contact_name) setActiveTab("contact-info");
      else setActiveTab("client-info");
      return;
    }
    createMutation.mutate();
  };

  const toggleOffering = (value: string) => {
    setClientInfo((prev) => {
      const exists = prev.payment_offerings.includes(value);
      return {
        ...prev,
        payment_offerings: exists
          ? prev.payment_offerings.filter((v) => v !== value)
          : [...prev.payment_offerings, value],
      };
    });
  };

  const updateContact = (idx: number, key: string, value: string) => {
    setContacts((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));
  };

  const addContact = () => setContacts((prev) => [...prev, { contact_name: "", designation: "", phone: "", email: "", linkedin: "" }]);
  const removeContact = (idx: number) => setContacts((prev) => prev.filter((_, i) => i !== idx));

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
                <div>
                  <Label>Source *</Label>
                  <Select value={clientInfo.source} onValueChange={(v) => setClientInfo((p) => ({ ...p, source: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.source && <p className="text-red-600 text-xs mt-1">{errors.source}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Client Name *</Label>
                    <Input value={clientInfo.client_name} onChange={(e) => setClientInfo((p) => ({ ...p, client_name: e.target.value }))} placeholder="Enter client name" />
                    {errors.client_name && <p className="text-red-600 text-xs mt-1">{errors.client_name}</p>}
                  </div>
                  <div>
                    <Label>Client Type</Label>
                    <Select value={clientInfo.client_type} onValueChange={(v) => setClientInfo((p) => ({ ...p, client_type: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Payment Offering (multi-select) *</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {PAYMENT_OFFERINGS.map((opt) => {
                      const active = clientInfo.payment_offerings.includes(opt);
                      return (
                        <Button key={opt} type="button" variant={active ? "default" : "outline"} onClick={() => toggleOffering(opt)}>
                          {opt}
                        </Button>
                      );
                    })}
                  </div>
                  {errors.payment_offerings && <p className="text-red-600 text-xs mt-1">{errors.payment_offerings}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input className="pl-10" value={clientInfo.website} onChange={(e) => setClientInfo((p) => ({ ...p, website: e.target.value }))} placeholder="https://example.com" />
                    </div>
                  </div>
                  <div>
                    <Label>Client Geography *</Label>
                    <Select value={clientInfo.geography} onValueChange={(v) => setClientInfo((p) => ({ ...p, geography: v as any }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select geography" />
                      </SelectTrigger>
                      <SelectContent>
                        {GEOGRAPHY.map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.geography && <p className="text-red-600 text-xs mt-1">{errors.geography}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Txn Volume / per day in million *</Label>
                    <Select value={clientInfo.txn_volume} onValueChange={(v) => setClientInfo((p) => ({ ...p, txn_volume: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select volume" />
                      </SelectTrigger>
                      <SelectContent>
                        {TXN_VOLUMES.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.txn_volume && <p className="text-red-600 text-xs mt-1">{errors.txn_volume}</p>}
                  </div>
                  <div>
                    <Label>Product Tag Info *</Label>
                    <Input value={clientInfo.product_tag_info} onChange={(e) => setClientInfo((p) => ({ ...p, product_tag_info: e.target.value }))} placeholder="Enter product tags" />
                    {errors.product_tag_info && <p className="text-red-600 text-xs mt-1">{errors.product_tag_info}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact-info" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" /> Client Contact Information
                </CardTitle>
                <CardDescription>Same layout as investor contact info</CardDescription>
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
                        <Label>Contact Name {idx === 0 ? "*" : ""}</Label>
                        <Input value={c.contact_name} onChange={(e) => updateContact(idx, "contact_name", e.target.value)} placeholder="Full name" />
                        {idx === 0 && errors.primary_contact_name && <p className="text-red-600 text-xs mt-1">{errors.primary_contact_name}</p>}
                      </div>
                      <div>
                        <Label>Designation</Label>
                        <Input value={c.designation} onChange={(e) => updateContact(idx, "designation", e.target.value)} placeholder="Job title" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Email {idx === 0 ? "*" : ""}</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input className="pl-10" value={c.email} onChange={(e) => updateContact(idx, "email", e.target.value)} placeholder="name@company.com" />
                        </div>
                        {idx === 0 && errors.primary_contact_email && <p className="text-red-600 text-xs mt-1">{errors.primary_contact_email}</p>}
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input className="pl-10" value={c.phone} onChange={(e) => updateContact(idx, "phone", e.target.value)} placeholder="+91 98765 43210" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label>LinkedIn or Other Contact Links</Label>
                      <Input value={c.linkedin} onChange={(e) => updateContact(idx, "linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." />
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
