// src/components/UserProfile.tsx

import React, { useState, useCallback, useRef, useEffect } from "react";
import { LogOut, UserRound, ChevronDown, LayoutDashboard, Settings, Camera, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { logoutTo } from "@/utils/logout";
import { setUserPassword, uploadUserAvatar, setUserSkuNumber } from "@/lib/usersApi";

type User = {
  id: number | string;
  name: string;
  avatar_url?: string | null;
  role?: string;
  sku_next_number?: number | null;
};

type UserProfileProps = {
  user: User;
  onUpdate: (updatedUser: User) => void;
  logoutPath: string;
};

export function UserProfile({ user, onUpdate, logoutPath }: UserProfileProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [skuNumber, setSkuNumber] = useState<string>(
    user.sku_next_number != null ? String(user.sku_next_number) : ""
  );
  const [skuSaving, setSkuSaving] = useState(false);

  // Keep local SKU input in sync with the actual user value
  useEffect(() => {
    setSkuNumber(
      user.sku_next_number != null ? String(user.sku_next_number) : ""
    );
  }, [user.sku_next_number]);

  // --- NEW: Refresh user data when modal opens to catch external SKU updates ---
  useEffect(() => {
    if (settingsOpen && user.id) {
      const fetchFreshUser = async () => {
        try {
          // Determine API Base URL (mimicking standard config)
          const apiBase = (import.meta as any).env?.VITE_API_URL || "/backend";
          
          const res = await fetch(`${apiBase}/auth/users/${user.id}`);
          if (res.ok) {
            const freshData = await res.json();
            // If the SKU on server is different from local prop, update parent state
            if (freshData && freshData.sku_next_number !== user.sku_next_number) {
              onUpdate({ ...user, ...freshData });
            }
          }
        } catch (e) {
          console.warn("Failed to refresh user data on modal open", e);
        }
      };
      fetchFreshUser();
    }
  }, [settingsOpen, user.id]);
  // --------------------------------------------------------------------------

  const userInitials = (user.name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const handlePasswordUpdate = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await setUserPassword(user.id, password || null);
      setSettingsOpen(false);
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    }
  };
  
  const handleSkuUpdate = async () => {
    setError(null);

    const value = skuNumber.trim();
    const parsed = Number(value);

    if (!value || Number.isNaN(parsed) || parsed < 1) {
      setError("Please enter a valid SKU number (1 or higher).");
      return;
    }

    try {
      setSkuSaving(true);
      const result = await setUserSkuNumber(user.id, parsed);
      const updatedUser: User = {
        ...user,
        sku_next_number: result.next_number,
      };
      onUpdate(updatedUser);
    } catch (e: any) {
      setError(e?.message || "Failed to update SKU number.");
    } finally {
      setSkuSaving(false);
    }
  };

  const handleCloudinaryUpload = async (file: File): Promise<string> => {
    const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
        console.error("Cloudinary environment variables (VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET) are not set.");
        throw new Error("Cloudinary is not configured.");
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error("Cloudinary upload failed.");
    const result = await response.json();
    return result.secure_url;
  };

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const cloudinaryUrl = await handleCloudinaryUpload(file);
      const { avatar_url } = await uploadUserAvatar(user.id, cloudinaryUrl);
      const updatedUser = { ...user, avatar_url };
      onUpdate(updatedUser);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 px-2 gap-2" title={user.name}>
            <Avatar className="h-6 w-6">
              {user.avatar_url ? <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" /> : <AvatarFallback className="text-[11px]">{userInitials}</AvatarFallback>}
            </Avatar>
            <span className="hidden sm:inline text-sm max-w-[140px] truncate">{user.name}</span>
            <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2">
            <UserRound className="h-4 w-4 opacity-70" />
            {user.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={() => setSettingsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Profile Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => (window.location.href = "/")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Go to Hub</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => logoutTo(logoutPath)}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        {/* Changed max-w to 750px for 2-column layout, kept safety overflow */}
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
          </DialogHeader>
          
          <div className="py-4 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
            
            {/* LEFT COLUMN: Avatar & Identity */}
            <div className="flex flex-col items-center gap-4 pt-2">
              <div className="relative group">
                <Avatar className="h-32 w-32 text-4xl shadow-sm border">
                  {user.avatar_url ? <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" /> : <AvatarFallback>{userInitials}</AvatarFallback>}
                </Avatar>
                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                   <Camera className="text-white h-8 w-8" />
                </div>
                <input type="file" ref={fileInputRef} onChange={onFileSelected} accept="image/*" style={{ display: 'none' }} />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold">{user.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage your account details and preferences.</p>
              </div>
            </div>

            {/* RIGHT COLUMN: Forms */}
            <div className="space-y-6 border-t md:border-t-0 md:border-l md:pl-8 pt-6 md:pt-0">
              
              {/* Password Section */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                   Account Security
                </h3>
                <div className="grid gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="password">New Password</Label>
                        <div className="relative">
                        <Input id="password" type={isPasswordVisible ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current" />
                        <button type="button" onClick={() => setIsPasswordVisible(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input id="confirm-password" type={isPasswordVisible ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                    </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="h-px bg-border" />

              {/* SKU Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">SKU Configuration</h3>
                </div>
                <div className="flex items-end gap-3">
                    <div className="space-y-2 flex-1">
                        <Label htmlFor="sku-number">Next Number</Label>
                        <Input
                        id="sku-number"
                        type="number"
                        min={1}
                        value={skuNumber}
                        onChange={(e) => setSkuNumber(e.target.value)}
                        placeholder="500"
                        />
                    </div>
                    <Button size="sm" variant="secondary" onClick={handleSkuUpdate} disabled={skuSaving} className="mb-0.5">
                        {skuSaving ? "Saving..." : "Update SKU"}
                    </Button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                Increments automatically when you link an eBay URL. Used to generate SKUs like <strong>TH {skuNumber || "#"}...</strong>
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between sm:items-center"> 
            <div className="text-xs text-muted-foreground hidden sm:block">
                Changes to profile picture are saved automatically.
            </div> 
            <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button> 
                <Button onClick={handlePasswordUpdate}>Save Password</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}