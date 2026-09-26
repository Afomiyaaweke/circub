'use client'

// The "I am joining as *" role question - the SAME picker is shown while a
// member registers (register-modal) and inside the Live Zone join modal
// (guide-register-modal). The sign-up answer is stored on User.guideRoles and
// arrives prefilled here when the member later joins the Live Zone program.
import { CheckCircle2, Video, Compass, Users, Heart, ShoppingBag } from 'lucide-react'
import { CIRCUB_ROLES, ROLE_META, type CircubRole } from '@/lib/roles'
import { useLanguage } from '@/lib/i18n'

// Chip icons per role (Video/Compass double as section icons elsewhere).
export const ROLE_ICONS: Record<CircubRole, React.ComponentType<{ className?: string }>> = {
  vlogger: Video,
  guide: Compass,
  local: Users,
  volunteer: Heart,
  sales: ShoppingBag,
}

interface RolePickerProps {
  roles: CircubRole[]
  onToggle: (role: CircubRole) => void
  // data-testids default to the Live Zone modal's long-standing values; the
  // sign-up modal overrides them so E2E selectors never collide.
  sectionTestId?: string
  chipPrefix?: string
}

export function RolePicker({
  roles,
  onToggle,
  sectionTestId = 'guide-roles-section',
  chipPrefix = 'role-chip',
}: RolePickerProps) {
  // Role labels/blurbs translate through i18n with the English ROLE_META copy
  // as fallback, so the question reads natively in every app language.
  const { t } = useLanguage()
  const roleLabel = (role: CircubRole) => t(`roles.${role}` as never) || ROLE_META[role].label
  const roleBlurb = (role: CircubRole) => t(`roles.${role}Blurb` as never) || ROLE_META[role].blurb
  return (
    <div className="space-y-2" data-testid={sectionTestId}>
      <label className="text-xs text-muted-foreground font-medium">{t("roles.question")}</label>
      <div className="grid grid-cols-2 gap-2">
        {CIRCUB_ROLES.map((role) => {
          const Icon = ROLE_ICONS[role]
          const active = roles.includes(role)
          return (
            <button
              key={role}
              type="button"
              data-testid={`${chipPrefix}-${role}`}
              aria-pressed={active}
              onClick={() => onToggle(role)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {roleLabel(role)}
                {active && <CheckCircle2 className="w-3 h-3 ml-auto shrink-0" />}
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{roleBlurb(role)}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        {t('roles.hint')}
      </p>
    </div>
  )
}
