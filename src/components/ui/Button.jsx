export default function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-terra-500/30'

  const variants = {
    primary:   'bg-warm-gray-900 text-cream-50 hover:bg-warm-gray-800',
    secondary: 'bg-cream-200 text-warm-gray-800 hover:bg-cream-300',
    ghost:     'text-warm-gray-600 hover:bg-cream-200',
    danger:    'bg-red-500/10 text-red-600 hover:bg-red-500/20',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  }

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
