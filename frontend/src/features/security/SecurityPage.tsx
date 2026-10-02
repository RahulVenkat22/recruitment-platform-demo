import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  FileCheck2Icon,
  FingerprintIcon,
  Globe2Icon,
  KeyRoundIcon,
  LockKeyholeIcon,
  MessageSquareTextIcon,
  ShieldIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/shared/PageHeader'
import { StaggerItem } from '@/components/shared/Stagger'
import { Button } from '@/components/ui/button'
import './security.css'

// These describe commitments, not verified compliance or certification status.
// Publish specific certifications or audit reports only with supporting evidence.
const STANDARDS = [
  {
    id: 'gdpr',
    name: 'GDPR',
    fullName: 'General Data Protection Regulation',
    category: 'Privacy regulation',
    icon: Globe2Icon,
    description:
      'The European Union’s rules for handling personal information and respecting the rights of the people it belongs to.',
    commitment:
      'Respect personal information, explain how it is used, and support applicable rights to access, correct, or delete it.',
    focus: 'Your information. Your rights.',
    href: 'https://commission.europa.eu/law/law-topic/data-protection/legal-framework-eu-data-protection_en',
  },
  {
    id: 'iso-27001',
    name: 'ISO 27001',
    fullName: 'Information security management',
    category: 'Security standard',
    icon: ShieldIcon,
    description:
      'An international standard for managing information security through policies, risk assessment, and ongoing improvement.',
    commitment:
      'Use a structured approach to identifying security risks and improving the safeguards around candidate and team information.',
    focus: 'Security as an ongoing responsibility.',
    href: 'https://www.iso.org/standard/27001',
  },
  {
    id: 'ccpa',
    name: 'CCPA',
    fullName: 'California Consumer Privacy Act',
    category: 'Privacy regulation',
    icon: FingerprintIcon,
    description:
      'California’s privacy law gives eligible consumers rights over the personal information businesses collect and use.',
    commitment:
      'Make privacy choices understandable and support applicable requests to know, correct, delete, or opt out of the sale or sharing of personal information.',
    focus: 'Clear choices about personal data.',
    href: 'https://www.oag.ca.gov/privacy/ccpa',
  },
  {
    id: 'soc-2',
    name: 'AICPA SOC 2',
    fullName: 'Independent assurance over controls',
    category: 'Assurance report',
    icon: ClipboardCheckIcon,
    description:
      'An independent examination of a service organization’s controls against relevant AICPA Trust Services Criteria.',
    commitment:
      'Treat documented controls and evidence of their operation as the foundation for accountable security practices.',
    focus: 'Trust supported by evidence.',
    href: 'https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2',
  },
  {
    id: 'soc-3',
    name: 'AICPA SOC 3',
    fullName: 'Assurance for a wider audience',
    category: 'Assurance report',
    icon: FileCheck2Icon,
    description:
      'A general-use assurance report covering similar controls to SOC 2, with less detail and suitable for public distribution.',
    commitment:
      'Communicate security practices clearly so customers can understand our approach and ask for supporting information.',
    focus: 'Security you can understand.',
    href: 'https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-3',
  },
  {
    id: 'oauth',
    name: 'OAuth',
    fullName: 'Delegated authorization',
    category: 'Access protocol',
    icon: KeyRoundIcon,
    description:
      'An authorization framework that lets connected applications request limited access without receiving your password.',
    commitment:
      'Use limited, explicit permissions as the guiding principle for connected services. OAuth is a reference for integrations, not a claim that OAuth sign-in is available.',
    focus: 'Access with clear boundaries.',
    href: 'https://www.rfc-editor.org/rfc/rfc6749',
  },
] as const

function TrustIllustration() {
  return (
    <div className="security-orbit" aria-hidden="true">
      <div className="security-orbit__ring security-orbit__ring--outer" />
      <div className="security-orbit__ring security-orbit__ring--inner" />
      <div className="security-orbit__core">
        <LockKeyholeIcon strokeWidth={1.25} />
        <span>TalentOS</span>
      </div>
      {STANDARDS.map((standard, index) => (
        <span key={standard.id} className={`security-orbit__label security-orbit__label--${index}`}>
          {standard.name.replace('AICPA ', '')}
        </span>
      ))}
    </div>
  )
}

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        title="Security & Trust"
        subtitle="Understand the principles behind our approach to your data, privacy, and access."
        breadcrumbs={[{ label: 'Security & Trust' }]}
        actions={
          <Button variant="outline" asChild>
            <Link to="/support">
              <MessageSquareTextIcon aria-hidden="true" />
              Contact support
            </Link>
          </Button>
        }
      />

      <div className="security-page space-y-8">
        <section className="security-hero" aria-labelledby="security-intro">
          <div className="security-hero__copy">
            <p className="security-eyebrow text-[#dce98c]">
              <ShieldIcon className="size-4" aria-hidden="true" /> Our security commitments
            </p>
            <h2
              id="security-intro"
              className="mt-5 font-heading text-[clamp(30px,3.3vw,46px)] leading-[1.15] font-semibold tracking-tight"
            >
              Your trust.
              <br />
              <span className="text-[#dce98c]">Our responsibility.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[14px]/7 text-[#cfdee3]">
              Behind every application is a person. Our commitment is to handle candidate and team
              information with care, respect privacy, and make our security approach clear.
            </p>
            <a className="security-hero__link mt-6" href="#security-standards">
              Explore our standards <ArrowDownIcon className="size-4" aria-hidden="true" />
            </a>
          </div>
          <TrustIllustration />
          <div className="security-hero__footer">
            <span>
              <FingerprintIcon aria-hidden="true" /> Respect for privacy
            </span>
            <span>
              <ClipboardCheckIcon aria-hidden="true" /> Accountable practices
            </span>
            <span>
              <KeyRoundIcon aria-hidden="true" /> Responsible access
            </span>
          </div>
        </section>

        <section id="security-standards" aria-labelledby="standards-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="security-eyebrow text-primary">A clear foundation</p>
              <h2 id="standards-heading" className="mt-2 text-h2 text-ink">
                The standards that guide our approach
              </h2>
              <p className="mt-2 max-w-2xl text-small leading-6 text-ink-muted">
                Six references across privacy, information security, independent assurance, and
                access. Here is what each one means for you.
              </p>
            </div>
            <a href="#security-questions" className="security-text-link text-small">
              About compliance & certification{' '}
              <ArrowDownIcon className="size-3.5" aria-hidden="true" />
            </a>
          </div>

          <div className="security-standards-grid">
            {STANDARDS.map((standard, index) => {
              const Icon = standard.icon
              return (
                <StaggerItem key={standard.id} index={index}>
                  <article
                    className="security-standard"
                    aria-labelledby={`standard-${standard.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="security-standard__icon">
                        <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
                      </span>
                      <span className="rounded-pill border border-line px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                        {standard.category}
                      </span>
                    </div>
                    <h3
                      id={`standard-${standard.id}`}
                      className="mt-5 font-heading text-xl font-bold tracking-tight text-ink"
                    >
                      {standard.name}
                    </h3>
                    <p className="mt-1 text-caption text-ink-subtle">{standard.fullName}</p>
                    <p className="mt-4 text-small leading-6 text-ink-muted">
                      {standard.description}
                    </p>
                    <div className="security-standard__commitment">
                      <p className="security-eyebrow text-primary">Our commitment</p>
                      <p className="mt-2 text-small leading-6 text-ink">{standard.commitment}</p>
                    </div>
                    <div className="mt-auto border-t border-line pt-4">
                      <p className="text-caption font-medium text-ink-muted">{standard.focus}</p>
                      <a
                        href={standard.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="security-text-link mt-3 text-small"
                        aria-label={`Read the official ${standard.name} reference (opens in a new tab)`}
                      >
                        Official reference{' '}
                        <ArrowUpRightIcon className="size-4" aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                </StaggerItem>
              )
            })}
          </div>
        </section>

        <section
          id="security-questions"
          className="security-questions"
          aria-labelledby="questions-heading"
        >
          <div>
            <p className="security-eyebrow text-primary">Clarity comes first</p>
            <h2 id="questions-heading" className="mt-2 text-h2 text-ink">
              Your questions, answered.
            </h2>
            <p className="mt-3 text-small leading-6 text-ink-muted">
              Understanding a standard also means understanding what it does—and what a reference to
              it tells you.
            </p>
          </div>
          <div className="min-w-0">
            <details className="security-question" open>
              <summary>
                Are these certifications or completed audits?
                <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
              </summary>
              <p>
                This page describes our security commitments. It does not assert ISO 27001
                certification, completed SOC 2 or SOC 3 audits, or independently verified GDPR or
                CCPA compliance. Contact Support for the current status and any available supporting
                documentation.
              </p>
            </details>
            <details className="security-question">
              <summary>
                How can I ask about my personal information?
                <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
              </summary>
              <p>
                Open a{' '}
                <Link to="/support" className="underline underline-offset-4">
                  support ticket
                </Link>{' '}
                to ask how your information is used or request access, correction, or deletion. The
                team can explain which rights apply and how your request will be handled.
              </p>
            </details>
            <details className="security-question">
              <summary>
                Does OAuth mean I can use single sign-on?
                <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
              </summary>
              <p>
                OAuth governs permission to access resources. It is not, by itself, a sign-in
                protocol. Its inclusion here does not mean single sign-on or an OAuth integration is
                currently available in your workspace.
              </p>
            </details>
          </div>
        </section>

        <section className="security-contact" aria-labelledby="security-contact-heading">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-primary">
            <MessageSquareTextIcon className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="security-contact-heading" className="text-h3 text-ink">
              Trust starts with a conversation.
            </h2>
            <p className="mt-1 text-small leading-6 text-ink-muted">
              Have a privacy question or need security documentation? Talk to our support team.
            </p>
          </div>
          <Button asChild>
            <Link to="/support">
              Get in touch <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </div>
    </>
  )
}
