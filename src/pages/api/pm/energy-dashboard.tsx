import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Zap, DollarSign, Target } from 'lucide-react';

const EnergyDashboard = () => {
  const [dateRange, setDateRange] = useState('12months');
  const [savingsTarget, setSavingsTarget] = useState(10);

  // Sample data
  const kpiData = {
    avgScore: { value: 72, trend: 5.2, isUp: true },
    avgEUI: { value: 54.3, trend: -3.1, isUp: false },
    totalConsumption: { value: '12.4M', unit: 'kWh', cost: '$1.86M' },
    costSavings: { value: '$124K', trend: 8.5, isUp: true },
    meetingTarget: { current: 8, total: 12 }
  };

  const schoolScores = [
    { name: 'Lincoln HS', score: 89, eui: 45.2, costPerSF: 2.15 },
    { name: 'Washington MS', score: 78, eui: 51.3, costPerSF: 2.38 },
    { name: 'Roosevelt ES', score: 76, eui: 48.7, costPerSF: 2.29 },
    { name: 'Jefferson ES', score: 74, eui: 52.1, costPerSF: 2.42 },
    { name: 'Madison MS', score: 71, eui: 55.8, costPerSF: 2.56 },
    { name: 'Monroe ES', score: 69, eui: 57.2, costPerSF: 2.63 },
    { name: 'Adams ES', score: 68, eui: 58.9, costPerSF: 2.71 },
    { name: 'Jackson HS', score: 65, eui: 61.3, costPerSF: 2.82 },
    { name: 'Kennedy MS', score: 62, eui: 63.7, costPerSF: 2.93 },
    { name: 'Wilson ES', score: 58, eui: 66.2, costPerSF: 3.05 },
    { name: 'Polk ES', score: 55, eui: 68.5, costPerSF: 3.15 },
    { name: 'Harrison ES', score: 52, eui: 72.1, costPerSF: 3.32 }
  ];

  const trendData = [
    { month: 'Nov', electricity: 980, gas: 1250 },
    { month: 'Dec', electricity: 1150, gas: 1480 },
    { month: 'Jan', electricity: 1220, gas: 1580 },
    { month: 'Feb', electricity: 1180, gas: 1520 },
    { month: 'Mar', electricity: 1050, gas: 1320 },
    { month: 'Apr', electricity: 920, gas: 1080 },
    { month: 'May', electricity: 850, gas: 920 },
    { month: 'Jun', electricity: 780, gas: 850 },
    { month: 'Jul', electricity: 820, gas: 880 },
    { month: 'Aug', electricity: 890, gas: 950 },
    { month: 'Sep', electricity: 940, gas: 1050 },
    { month: 'Oct', electricity: 1020, gas: 1180 }
  ];

  const costData = [
    { month: 'Nov', cost: 147 },
    { month: 'Dec', cost: 172 },
    { month: 'Jan', cost: 186 },
    { month: 'Feb', cost: 178 },
    { month: 'Mar', cost: 158 },
    { month: 'Apr', cost: 138 },
    { month: 'May', cost: 128 },
    { month: 'Jun', cost: 118 },
    { month: 'Jul', cost: 122 },
    { month: 'Aug', cost: 133 },
    { month: 'Sep', cost: 141 },
    { month: 'Oct', cost: 153 }
  ];

  const energyMix = [
    { name: 'Electricity', value: 68, color: '#3b82f6' },
    { name: 'Natural Gas', value: 28, color: '#f59e0b' },
    { name: 'Other', value: 4, color: '#6b7280' }
  ];

  const getScoreColor = (score) => {
    if (score >= 75) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  // National median EUI for K-12 schools from ENERGY STAR
  const nationalMedianEUI = 58.5; // This would come from ENERGY STAR API
  
  // Calculate potential savings
  const targetEUI = nationalMedianEUI * (1 - savingsTarget / 100);
  const currentTotalKBtu = schoolScores.reduce((sum, school) => sum + school.eui, 0) * 100000;
  const targetTotalKBtu = schoolScores.reduce((sum, school) => {
    return sum + (school.eui > targetEUI ? targetEUI : school.eui);
  }, 0) * 100000;
  const kBtuSavings = currentTotalKBtu - targetTotalKBtu;
  const costSavings = (kBtuSavings / 3412) * 0.15;
  const schoolsNeedingImprovement = schoolScores.filter(s => s.eui > targetEUI).length;

  const KPICard = ({
    title,
    value,
    unit,
    trend,
    isUp,
    icon: Icon,
    subtitle,
  }: {
    title: string;
    value: React.ReactNode;
    unit?: string;
    trend?: number;
    isUp?: boolean;
    icon?: React.ComponentType<{ className?: string; size?: number }>;
    subtitle?: string;
  }) => (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
          </div>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${isUp ? 'text-green-600' : 'text-red-600'}`}>
              {isUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span className="font-medium">{Math.abs(trend)}%</span>
              <span className="text-gray-500 text-xs">vs last period</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <Icon className="text-blue-600" size={24} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">District Energy Dashboard</h1>
        <div className="flex items-center justify-between">
          <p className="text-gray-600">Overview of all 12 school buildings</p>
          <div className="flex gap-3">
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="12months">Last 12 Months</option>
              <option value="6months">Last 6 Months</option>
              <option value="ytd">Year to Date</option>
            </select>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Sync ENERGY STAR
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Last updated: October 31, 2025 at 8:42 AM</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard 
          title="District Avg ENERGY STAR Score"
          value={kpiData.avgScore.value}
          trend={kpiData.avgScore.trend}
          isUp={kpiData.avgScore.isUp}
          icon={Target}
        />
        <KPICard 
          title="District Average EUI"
          value={kpiData.avgEUI.value}
          unit="kBtu/sf/yr"
          trend={kpiData.avgEUI.trend}
          isUp={kpiData.avgEUI.isUp}
          icon={Zap}
        />
        <KPICard 
          title="Total Energy Consumption"
          value={kpiData.totalConsumption.value}
          unit={kpiData.totalConsumption.unit}
          subtitle={kpiData.totalConsumption.cost}
          icon={Zap}
        />
        <KPICard 
          title="YTD Cost Savings"
          value={kpiData.costSavings.value}
          trend={kpiData.costSavings.trend}
          isUp={kpiData.costSavings.isUp}
          icon={DollarSign}
        />
      </div>

      {/* Monthly Cost Chart */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Total Spend</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={costData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis label={{ value: 'Cost ($K)', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(value) => `$${value}K`} />
            <Bar dataKey="cost" fill="#10b981" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cost per SF Chart */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Annual Cost per Square Foot by School</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={schoolScores} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => `$${value}/sf`} />
            <Bar dataKey="costPerSF" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* School Comparison */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ENERGY STAR Score by School</h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={schoolScores} layout="vertical" margin={{ left: 100, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} />
              <Tooltip content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                      <p className="font-semibold">{payload[0].payload.name}</p>
                      <p className="text-sm">Score: {payload[0].value}</p>
                      <p className="text-sm">EUI: {payload[0].payload.eui} kBtu/sf/yr</p>
                    </div>
                  );
                }
                return null;
              }} />
              <ReferenceLine x={50} stroke="#6b7280" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'National Median', position: 'top', fill: '#6b7280', fontSize: 12 }} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {schoolScores.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Line */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Energy Consumption Trend</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis label={{ value: 'kBtu/sf/yr (thousands)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="electricity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Electricity" />
              <Line type="monotone" dataKey="gas" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} name="Natural Gas" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Energy Mix */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Energy Mix</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={energyMix}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {energyMix.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {energyMix.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-gray-700">{item.name}</span>
                </div>
                <span className="font-medium text-gray-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Grid */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Overview Grid</h2>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {schoolScores.map((school) => (
              <div 
                key={school.name}
                className="p-4 rounded-lg border-2 transition-all hover:shadow-md cursor-pointer"
                style={{ 
                  backgroundColor: `${getScoreColor(school.score)}15`,
                  borderColor: getScoreColor(school.score)
                }}
              >
                <div className="text-xs font-medium text-gray-700 mb-1 truncate" title={school.name}>
                  {school.name}
                </div>
                <div className="text-2xl font-bold" style={{ color: getScoreColor(school.score) }}>
                  {school.score}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  EUI: {school.eui}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performers</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {schoolScores.slice(0, 5).map((school, idx) => (
            <div key={school.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{school.name}</div>
                <div className="text-xs text-gray-600">Score: {school.score}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Savings Calculator */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-lg p-6 border-2 border-blue-200">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Potential Savings Calculator</h2>
            <p className="text-sm text-gray-600">Calculate savings if all schools performed below the national median EUI</p>
          </div>
          <div className="bg-white rounded-lg px-4 py-2 border border-blue-300">
            <div className="text-xs text-gray-600">National Median EUI</div>
            <div className="text-lg font-bold text-blue-600">{nationalMedianEUI.toFixed(1)} kBtu/sf/yr</div>
            <div className="text-xs text-gray-500 mt-1">ENERGY STAR K-12</div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-semibold text-gray-700">
              Target: {savingsTarget}% below national median
            </label>
            <div className="text-right">
              <div className="text-xs text-gray-600">Target EUI</div>
              <div className="text-xl font-bold text-blue-600">{targetEUI.toFixed(1)} kBtu/sf/yr</div>
            </div>
          </div>
          
          <input
            type="range"
            min="5"
            max="30"
            step="1"
            value={savingsTarget}
            onChange={(e) => setSavingsTarget(Number(e.target.value))}
            className="w-full h-3 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>5%</span>
            <span>15%</span>
            <span>30%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-5 border-2 border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="text-green-600" size={20} />
              <h3 className="text-sm font-semibold text-gray-700">Annual Cost Savings</h3>
            </div>
            <div className="text-3xl font-bold text-green-600">
              ${(costSavings / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {kBtuSavings.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} kBtu/year
            </div>
          </div>

          <div className="bg-white rounded-lg p-5 border-2 border-amber-200">
            <div className="flex items-center gap-2 mb-2">
              <Target className="text-amber-600" size={20} />
              <h3 className="text-sm font-semibold text-gray-700">Schools Needing Improvement</h3>
            </div>
            <div className="text-3xl font-bold text-amber-600">
              {schoolsNeedingImprovement} of 12
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Currently above target EUI
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-100 rounded-lg p-4 border border-blue-300">
          <div className="flex items-start gap-3">
            <div className="bg-blue-600 rounded-full p-2 mt-0.5">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-900 mb-1">Benchmark Context:</h4>
              <p className="text-sm text-blue-800">
                The national median EUI of {nationalMedianEUI.toFixed(1)} kBtu/sf/yr is based on ENERGY STAR's database of K-12 schools across the country, adjusted for climate and building characteristics. Focus efficiency efforts on the {schoolsNeedingImprovement} schools above {targetEUI.toFixed(1)} kBtu/sf/yr through HVAC optimization, lighting upgrades, and building envelope improvements.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnergyDashboard;
