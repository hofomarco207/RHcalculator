interface PageHeaderProps {
  title: string
  description?: string
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="space-y-1 animate-in">
      <h1
        className="text-2xl font-bold tracking-tight text-[#1C1E26]"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {title}
      </h1>
      {description && (
        <p className="text-sm text-[#6B7280]">{description}</p>
      )}
    </div>
  )
}
