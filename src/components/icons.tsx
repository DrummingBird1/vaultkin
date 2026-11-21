/**
 * @file src/components/icons.tsx
 * The app's icon vocabulary, backed by lucide-react (consistent stroke icons,
 * tree-shaken per icon). Components keep importing `IconX` from here so the
 * set stays curated in one place; new code may also import from
 * "lucide-react" directly.
 *
 * Icons are decorative by default (aria-hidden) — give the surrounding button
 * an aria-label. Pass `aria-hidden={false}` plus a label for a standalone icon.
 */
import React from "react";
import {
  ChevronDown,
  ChevronRight,
  Construction,
  Copy,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  IdCard,
  Info,
  Lock,
  Pencil,
  Plus,
  Search,
  Shield,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
  Vault,
  X,
  type LucideIcon,
} from "lucide-react";

type IconProps = React.SVGProps<SVGSVGElement>;

function make(Icon: LucideIcon, name: string, extraClass = "") {
  const C = (props: IconProps) => (
    <Icon
      aria-hidden="true"
      focusable="false"
      strokeWidth={2}
      {...(props as Record<string, unknown>)}
      className={[extraClass, props.className].filter(Boolean).join(" ") || undefined}
    />
  );
  C.displayName = name;
  return C;
}

export const IconEye = make(Eye, "IconEye");
export const IconEyeOff = make(EyeOff, "IconEyeOff");
export const IconIdCard = make(IdCard, "IconIdCard");
export const IconInfo = make(Info, "IconInfo");
export const IconWarning = make(TriangleAlert, "IconWarning");
export const IconConstruction = make(Construction, "IconConstruction");
export const IconShield = make(Shield, "IconShield");
export const IconStar = make(Star, "IconStar");
export const IconClose = make(X, "IconClose");
export const IconEmptyVault = make(Vault, "IconEmptyVault");
export const IconFolder = make(Folder, "IconFolder");
export const IconFolderPlus = make(FolderPlus, "IconFolderPlus");
export const IconTag = make(Tag, "IconTag");
export const IconSearch = make(Search, "IconSearch");
// Points "forward": mirrored in right-to-left layouts.
export const IconChevronRight = make(ChevronRight, "IconChevronRight", "rtl:-scale-x-100");
export const IconChevronDown = make(ChevronDown, "IconChevronDown");
export const IconLock = make(Lock, "IconLock");
export const IconCopy = make(Copy, "IconCopy");
export const IconTrash = make(Trash2, "IconTrash");
export const IconEdit = make(Pencil, "IconEdit");
export const IconPlus = make(Plus, "IconPlus");
