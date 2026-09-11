export default function StatsCard({ title, value, icon: Icon, color = 'brand', suffix = '', change, changeLabel }) {
  const colorClasses = {
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-green-50 text-green-600',
    warning: 'bg-yellow-50 text-yellow-600',
    danger: 'bg-red-50 text-red-600',
    info: 'bg-blue-50 text-blue-600',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="card flex items-start justify-between transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#17211b]">
          {value}
          {suffix && <span className="text-lg ml-1">{suffix}</span>}
        </p>
        {change !== undefined && (
          <p className={`text-xs mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change >= 0 ? '+' : ''}{change}% {changeLabel || 'from last week'}
          </p>
        )}
      </div>
      {Icon && (
        <div className={`p-3 rounded-xl ${colorClasses[color] || colorClasses.brand}`}>
          <Icon className="w-6 h-6" />
        </div>
      )}
    </div>
  );
}
