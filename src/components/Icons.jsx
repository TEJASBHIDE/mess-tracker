import {
  Utensils,
  Tag,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  Edit3,
  Trash2,
  Settings,
  Wallet,
  QrCode,
  Copy,
  X,
  Bell,
  SunMedium,
  UtensilsCrossed,
  Moon,
  Zap,
  CheckCircle2,
  CreditCard,
  User,
  LogOut
} from 'lucide-react'

// Primary App Nav Icons
export function MealsIcon({ className = 'w-4 h-4' }) {
  return <Utensils className={className} />
}

export function PricesIcon({ className = 'w-4 h-4' }) {
  return <Tag className={className} />
}

export function SummaryIcon({ className = 'w-4 h-4' }) {
  return <BarChart3 className={className} />
}

// Utility Icons
export function CalendarIcon({ className = 'w-4 h-4' }) {
  return <Calendar className={className} />
}

export function ChevronLeftIcon({ className = 'w-4 h-4' }) {
  return <ChevronLeft className={className} />
}

export function ChevronRightIcon({ className = 'w-4 h-4' }) {
  return <ChevronRight className={className} />
}

export function CheckIcon({ className = 'w-4 h-4' }) {
  return <Check className={className} />
}

export function EditIcon({ className = 'w-4 h-4' }) {
  return <Edit3 className={className} />
}

export function TrashIcon({ className = 'w-4 h-4' }) {
  return <Trash2 className={className} />
}

export function SettingsIcon({ className = 'w-4 h-4' }) {
  return <Settings className={className} />
}

export function WalletIcon({ className = 'w-4 h-4' }) {
  return <Wallet className={className} />
}

export function QrCodeIcon({ className = 'w-4 h-4' }) {
  return <QrCode className={className} />
}

export function CopyIcon({ className = 'w-4 h-4' }) {
  return <Copy className={className} />
}

export function CloseIcon({ className = 'w-4 h-4' }) {
  return <X className={className} />
}

// Specialized Meal & Fintech Icons (Zero Emojis)
export function BreakfastIcon({ className = 'w-5 h-5' }) {
  return <SunMedium className={className} />
}

export function LunchIcon({ className = 'w-5 h-5' }) {
  return <UtensilsCrossed className={className} />
}

export function DinnerIcon({ className = 'w-5 h-5' }) {
  return <Moon className={className} />
}

export function BellIcon({ className = 'w-5 h-5' }) {
  return <Bell className={className} />
}

export function ZapIcon({ className = 'w-4 h-4' }) {
  return <Zap className={className} />
}

export function CheckCircleIcon({ className = 'w-4 h-4' }) {
  return <CheckCircle2 className={className} />
}

export function CreditCardIcon({ className = 'w-4 h-4' }) {
  return <CreditCard className={className} />
}

export function UserIcon({ className = 'w-4 h-4' }) {
  return <User className={className} />
}

export function LogOutIcon({ className = 'w-4 h-4' }) {
  return <LogOut className={className} />
}
