import {
  BriefcaseBusinessIcon,
  CheckIcon,
  FileTextIcon,
  SparklesIcon,
  UserRoundIcon,
} from 'lucide-react'

/** Decorative illustration of the matching flow; no simulated metrics or results. */
export function TalentOrbit({ className = '' }: { className?: string }) {
  return (
    <div className={`talent-orbit ${className}`} aria-hidden="true">
      <div className="talent-orbit__track">
        <span className="talent-orbit__node -top-4 left-1/2">
          <UserRoundIcon className="size-4" />
        </span>
        <span className="talent-orbit__node -bottom-3 left-6">
          <BriefcaseBusinessIcon className="size-4" />
        </span>
        <span className="talent-orbit__node top-1/2 -right-4">
          <FileTextIcon className="size-4" />
        </span>
      </div>
      <div className="talent-orbit__track talent-orbit__track--inner">
        <span className="talent-orbit__node top-4 -left-3">
          <CheckIcon className="size-4" />
        </span>
      </div>
      <div className="talent-orbit__core">
        <SparklesIcon className="size-7" strokeWidth={1.5} />
      </div>
      <span className="talent-orbit__label">Connecting people & possibility</span>
    </div>
  )
}
