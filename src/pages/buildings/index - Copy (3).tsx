import React, { useState, useMemo } from 'react';
import { useAuthGate } from '@/hooks/useAuthGate';
import { useBuildingsOverview } from '@/hooks/useBuildingsOverview'; // 👈 add
import { Search, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Clock } from 'lucide-react';
// ...your other imports

const { loading: rowsLoading, rows, error: rowsError } = useBuildingsOverview(orgId);

// use `rows` as your source instead of sampleBuildings
const buildings = rows;

  
const { loading: authLoading, orgId } = useAuthGate();


// PM Meters preview state (for dry run)
const [pmPreview, setPmPreview] = useState<any[] | null>(null);
const [pmLoading, setPmLoading] = useState(false);
const [pmError, setPmError] = useState<string | null>(null);



// Adjust this if your route name differs:
const PM_METERS_ENDPOINT = '/api/pm/sync-meters';

// Handler: Sync Meters (Dry Run)
async function handleDryRunMeters() {
  if (!orgId) {
    alert('No orgId found on your account. Please sign out/in or contact an admin.');
    return;
  }
  try {
    setPmLoading(true);
    setPmError(null);
    setPmPreview(null);

    const res = await fetch(`${PM_METERS_ENDPOINT}?orgId=${orgId}&dry=1`);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    const json = await res.json();
    // We don't assume a shape — show whatever the API returns under "results" or fallback to the whole object
    const results = Array.isArray(json?.results) ? json.results : (Array.isArray(json) ? json : [json]);
    setPmPreview(results);
  } catch (e: any) {
    setPmError(e?.message || String(e));
  } finally {
    setPmLoading(false);
  }
}

function buildingStatus(lastBillEndISO: string | null): "Current" | "Upload Bills" {
  if (!lastBillEndISO) return "Upload Bills";
  const now = new Date();
  const priorMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const lastEnd = new Date(lastBillEndISO);
  return lastEnd >= priorMonthEnd ? "Current" : "Upload Bills";
}

// Handler: Create All on PM (POST)
async function handleCreateAllMeters() {
  if (!orgId) {
    alert('No orgId found on your account. Please sign out/in or contact an admin.');
    return;
  }
  if (!window.confirm('Create all missing meters on Portfolio Manager?')) return;

  try {
    setPmLoading(true);
    setPmError(null);
    setPmPreview(null);

    const res = await fetch(`${PM_METERS_ENDPOINT}?orgId=${orgId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // adjust if your API expects a body
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    const json = await res.json();
    // Reuse the preview panel to show results from create-all
    const results = Array.isArray(json?.results) ? json.results : (Array.isArray(json) ? json : [json]);
    setPmPreview(results);
  } catch (e: any) {
    setPmError(e?.message || String(e));
  } finally {
    setPmLoading(false);
  }
}


  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  // Calculate summary stats
  const stats = useMemo(() => {
    const total = sampleBuildings.length;
    const complete = sampleBuildings.filter(b => b.hasPreviousMonthBill && b.missingMonths.length === 0).length;
    const missingData = total - complete;
    return { total, complete, missingData };
  }, []);

  // Filter and sort buildings
  const filteredBuildings = useMemo(() => {
    let filtered = buildings.filter(building => {
      const matchesSearch = building.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           building.address.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (filterStatus === 'complete') {
        return matchesSearch && building.hasPreviousMonthBill && building.missingMonths.length === 0;
      } else if (filterStatus === 'missing') {
        return matchesSearch && (!building.hasPreviousMonthBill || building.missingMonths.length > 0);
      }
      return matchesSearch;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'cost') {
        return b.annualCost - a.annualCost;
      } else if (sortBy === 'gaps') {
        return b.missingMonths.length - a.missingMonths.length;
      }
      return 0;
    });

    return filtered;
  }, [buildings, searchTerm, filterStatus, sortBy]);

  const getStatusColor = (building) => {
    if (building.hasPreviousMonthBill && building.missingMonths.length === 0) {
      return 'border-green-500';
    } else if (!building.hasPreviousMonthBill || building.missingMonths.length >= 3) {
      return 'border-red-500';
    }
    return 'border-yellow-500';
  };

  const getStatusBadge = (building) => {
    if (building.hasPreviousMonthBill && building.missingMonths.length === 0) {
      return (
        <div className="flex items-center gap-1 text-green-600 text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>Complete</span>
        </div>
      );
    } else if (!building.hasPreviousMonthBill || building.missingMonths.length >= 3) {
      return (
        <div className="flex items-center gap-1 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>Action Needed</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-yellow-600 text-sm">
        <Clock className="w-4 h-4" />
        <span>Minor Gaps</span>
      </div>
    );
  };

  const getTrendIcon = (trend) => {
    if (trend === 'up') {
      return <TrendingUp className="w-4 h-4 text-red-500" />;
    } else if (trend === 'down') {
      return <TrendingDown className="w-4 h-4 text-green-500" />;
    }
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };


  return authLoading ? (
  <div className="p-8 text-gray-500">Loading…</div>
) : !orgId ? (
  <div className="p-8 text-gray-600">No organization found for your account.</div>
) : (
  <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Buildings</h1>
          <p className="text-gray-600">Manage and monitor all district buildings</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Buildings</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="text-2xl font-bold text-gray-900">{stats.complete}</div>
            <div className="text-sm text-gray-600">Complete Data</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="text-2xl font-bold text-gray-900">{stats.missingData}</div>
            <div className="text-sm text-gray-600">Missing Data</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search buildings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('complete')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === 'complete'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Complete
              </button>
              <button
                onClick={() => setFilterStatus('missing')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === 'missing'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Missing Bills
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="name">Sort: A-Z</option>
              <option value="cost">Sort: Highest Cost</option>
              <option value="gaps">Sort: Most Gaps</option>
            </select>
          </div>
        </div>
        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            ... your existing filters ...
          </div>
        </div>

        {/* 👇 INSERT STEP 2.3 RIGHT HERE 👇 */}
        {rowsLoading && (
          <div className="p-4 text-gray-500">Loading buildings…</div>
        )}

        {rowsError && (
          <div className="p-4 text-red-600">Error: {rowsError}</div>
        )}

        {!rowsLoading && !rowsError && buildings.length === 0 && (
          <div className="p-4 text-gray-600">No buildings yet.</div>
        )}
        {/* 👆 END INSERTED BLOCK 👆 */}


           {/* Building Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBuildings.map((building) => {
            // 👇 Step 4: compute status for this building
            const status = buildingStatus(building.lastBillDate || null);

            return (
              <div
                key={building.id}
                onClick={() => alert(`Navigate to building ${building.id} detail page`)}
                className={`bg-white rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer border-l-4 ${getStatusColor(building)} overflow-hidden`}
              >
                {/* Card Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-lg text-gray-900 leading-tight">
                      {building.name}
                    </h3>

                    {/* 🔹 New status pill (Step 4, part 2) */}
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        status === "Current"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-1">{building.address}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                      {building.type}
                    </span>
                    <span className="text-xs text-gray-600">
                      {building.squareFeet.toLocaleString()} sq ft
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5">
                  {/* Previous Month Status */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">Oct 2024 Bill</span>
                      {building.hasPreviousMonthBill ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      Last updated: {formatDate(building.lastBillDate)}
                    </div>
                  </div>

                  {/* Data Gaps */}
                  {building.missingMonths.length > 0 && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="text-xs font-medium text-yellow-800 mb-1">
                        Missing {building.missingMonths.length} month
                        {building.missingMonths.length > 1 ? "s" : ""}
                      </div>
                      <div className="text-xs text-yellow-700">
                        {building.missingMonths
                          .slice(0, 3)
                          .map((month) => {
                            const date = new Date(month);
                            return date.toLocaleDateString("en-US", {
                              month: "short",
                              year: "numeric",
                            });
                          })
                          .join(", ")}
                        {building.missingMonths.length > 3 &&
                          ` +${building.missingMonths.length - 3} more`}
                      </div>
                    </div>
                  )}

                  {/* Quick Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Annual Cost</div>
                      <div className="text-lg font-bold text-gray-900">
                        ${(building.annualCost / 1000).toFixed(0)}k
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Avg Monthly</div>
                      <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
                        {(building.avgMonthlyUsage / 1000).toFixed(0)}k kWh
                        {getTrendIcon(building.trend)}
                      </div>
                    </div>
                  </div>

                  {/* Cost per sq ft */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Cost per sq ft</span>
                      <span className="text-sm font-semibold text-gray-900">
                        ${(building.annualCost / building.squareFeet).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div> {/* end of Building Cards Grid */}


        {/* PM Tools (UI only — not wired yet) */}
        <div className="mt-10 bg-white rounded-lg shadow p-6 border border-gray-200">
          <button
  type="button"
  className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 text-sm font-medium"
  onClick={() => {
    if (!orgId) {
      alert('No orgId found on your account. Please sign out/in or contact an admin.');
      return;
    }
    // Triggers the file download from your API route
    window.location.href = `/api/pm/export-properties-template?orgId=${orgId}`;
  }}
>
  Export PM Template
</button>

<button
  type="button"
  className="px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 text-sm font-medium disabled:opacity-60"
  onClick={handleDryRunMeters}
  disabled={pmLoading}
>
  {pmLoading ? 'Syncing…' : 'Sync Meters (Dry Run)'}
</button>
<button
  type="button"
  className="px-4 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-60"
  onClick={handleCreateAllMeters}
  disabled={pmLoading}
>
  {pmLoading ? 'Creating…' : 'Create All on PM'}
</button>


        </div>

        {/* Empty State */}
        {filteredBuildings.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
             <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No buildings found</h3>
            <p className="text-gray-600">
              {searchTerm
                ? "Try adjusting your search or filters"
                : "No buildings match the selected filters"}
            </p>
          </div>
        )}

                </div>

                   {/* Live preview — friendly summary with raw fallback */}
          <div className="mt-4">
            {pmError && (
              <div className="p-3 rounded border border-red-200 bg-red-50 text-red-800 text-sm">
                Error: {pmError}
              </div>
            )}

            {pmPreview && (() => {
              const arr = Array.isArray(pmPreview) ? pmPreview : [pmPreview];
              // If the API wraps results under { preview: [...] }, use that.
              const inner = Array.isArray(arr[0]?.preview) ? arr[0].preview : arr;

              if (Array.isArray(inner) && inner.length === 0) {
                return (
                  <div className="p-3 rounded border border-green-200 bg-green-50 text-green-800 text-sm">
                    <div className="font-semibold">All set — no meters need creation.</div>
                    <div className="text-green-900/80 mt-1">Dry run returned 0 items to create.</div>
                  </div>
                );
              }

              // Otherwise, show a compact JSON snapshot.
              return (
                <div className="p-3 rounded border border-blue-200 bg-blue-50 text-blue-900 text-sm">
                  <div className="font-semibold mb-2">
                    Dry Run Preview {Array.isArray(inner) ? `(${inner.length} item${inner.length === 1 ? '' : 's'})` : ''}
                  </div>
                  <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-64">
{JSON.stringify(pmPreview, null, 2)}
                  </pre>
                </div>
              );
            })()}
          </div>

        </div>

  );
};

export default BuildingsPage;
