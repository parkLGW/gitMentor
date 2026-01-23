interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  className?: string
}

export function LoadingSpinner({ size = 'md', text, className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className={`${sizeClasses[size]} relative`}>
        <div className="absolute inset-0 animate-spin">
          <div className="h-full w-full border-2 border-transparent border-t-purple-500 border-r-purple-500 rounded-full" />
        </div>
      </div>
      {text && <p className="text-xs text-gray-600">{text}</p>}
    </div>
  )
}

export default LoadingSpinner
