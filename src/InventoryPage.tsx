import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, History, Package, Plus, Search, X } from 'lucide-react'
import { supabase } from './lib/supabase'

type Workspace = { organizationId: string; clinicId: string; clinicName: string; role: string }
type InventoryItem = {
  id: string; clinic_id: string; name: string; category: string; brand: string | null; sku: string | null
  unit: string; reorder_threshold: number; current_stock: number; active: boolean; default_unit_cost: number
  supplier: string | null; batch_number: string | null; expiry_date: string | null; storage_notes: string | null; description: string | null
}
type Movement = { id: string; item_id: string; movement_type: string; quantity: number; total_value: number; movement_date: string; reason: string | null }

const categories = ['Consumables', 'Medicines', 'Disposables', 'Instruments', 'Other']
const movementTypes = ['usage', 'wastage', 'return', 'adjustment'] as const
const emptyForm = { name: '', category: 'Consumables', sku: '', initialQuantity: '0', unit: 'piece', reorderThreshold: '0', unitCost: '0', supplier: '', batchNumber: '', expiryDate: '', storageNotes: '', description: '' }
const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const monthStart = () => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10) }

export function InventoryPage({ workspace, onNotice }: { workspace: Workspace; onNotice: (message: string) => void }) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [itemOpen, setItemOpen] = useState(false)
  const [usagePickerOpen, setUsagePickerOpen] = useState(false)
  const [usageItem, setUsageItem] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState(emptyForm)

  const canManage = workspace.role === 'admin' || workspace.role === 'manager'
  const load = async () => {
    setLoading(true); setError('')
    const [itemResult, movementResult] = await Promise.all([
      supabase.from('inventory_items').select('id,clinic_id,name,category,brand,sku,unit,reorder_threshold,current_stock,active,default_unit_cost,supplier,batch_number,expiry_date,storage_notes,description').eq('clinic_id', workspace.clinicId).eq('active', true).order('name'),
      supabase.from('inventory_stock_movements').select('id,item_id,movement_type,quantity,total_value,movement_date,reason').gte('movement_date', monthStart()).order('movement_date', { ascending: false }),
    ])
    if (itemResult.error || movementResult.error) { const message = itemResult.error?.message || movementResult.error?.message || 'Could not load inventory.'; setError(message); onNotice(message) }
    setItems((itemResult.data || []) as InventoryItem[]); setMovements((movementResult.data || []) as Movement[]); setLoading(false)
  }
  useEffect(() => { void load() }, [workspace.clinicId])

  const filtered = useMemo(() => items.filter(item => {
    const text = `${item.name} ${item.category} ${item.sku || ''} ${item.supplier || ''}`.toLowerCase()
    const low = item.current_stock <= item.reorder_threshold
    return text.includes(query.trim().toLowerCase()) && (category === 'all' || item.category === category) && (stockFilter === 'all' || (stockFilter === 'low' ? low : !low))
  }), [items, query, category, stockFilter])
  const lowStock = items.filter(item => item.current_stock <= item.reorder_threshold).length
  const stockValue = items.reduce((sum, item) => sum + item.current_stock * item.default_unit_cost, 0)
  const usageThisMonth = movements.filter(item => item.movement_type === 'usage').reduce((sum, item) => sum + Math.abs(Number(item.total_value || 0)), 0)

  const createItem = async (event: FormEvent) => {
    event.preventDefault(); if (!form.name.trim()) return
    const user = (await supabase.auth.getUser()).data.user
    const created = await supabase.from('inventory_items').insert({ clinic_id: workspace.clinicId, name: form.name.trim(), category: form.category, sku: form.sku.trim() || null, unit: form.unit.trim() || 'piece', reorder_threshold: Number(form.reorderThreshold || 0), default_unit_cost: Number(form.unitCost || 0), supplier: form.supplier.trim() || null, batch_number: form.batchNumber.trim() || null, expiry_date: form.expiryDate || null, storage_notes: form.storageNotes.trim() || null, description: form.description.trim() || null, created_by: user?.id }).select().single()
    if (created.error || !created.data) { onNotice(created.error?.message || 'Could not create inventory item.'); return }
    const initialQuantity = Number(form.initialQuantity || 0)
    if (initialQuantity > 0) {
      const movement = await supabase.from('inventory_stock_movements').insert({ item_id: created.data.id, movement_type: 'purchase', quantity: initialQuantity, unit_cost_snapshot: Number(form.unitCost || 0), reason: 'Opening stock', created_by: user?.id }).select().single()
      if (movement.error) { await supabase.from('inventory_items').delete().eq('id', created.data.id); onNotice(movement.error.message); return }
    }
    setItemOpen(false); setForm(emptyForm); onNotice(`${form.name.trim()} added to inventory.`); await load()
  }

  const recordMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!usageItem) return
    const data = new FormData(event.currentTarget); const quantity = Number(data.get('quantity') || 0); if (quantity <= 0) return
    const user = (await supabase.auth.getUser()).data.user
    const result = await supabase.from('inventory_stock_movements').insert({ item_id: usageItem.id, movement_type: data.get('movementType'), quantity, unit_cost_snapshot: usageItem.default_unit_cost, reason: String(data.get('reason') || '').trim() || null, movement_date: data.get('movementDate') || new Date().toISOString().slice(0, 10), patient_id: String(data.get('patientId') || '').trim() || null, created_by: user?.id })
    if (result.error) { onNotice(result.error.message); return }
    setUsageItem(null); onNotice('Inventory movement recorded.'); await load()
  }

  return <section className="inventory-page">
    <div className="hero-row"><div><span className="eyebrow">ADMIN · INVENTORY</span><h1>Inventory</h1><p className="muted">Track clinical materials, medicines and consumables from stock receipt through patient and procedure-level usage.</p></div><div className="inventory-actions"><button className="ghost" onClick={() => void load()}><History size={16}/> Refresh</button>{canManage && <><button className="ghost" onClick={() => setUsagePickerOpen(true)} disabled={!items.length}><ArrowDownToLine size={16}/> Record usage</button><button className="primary" onClick={() => setItemOpen(true)}><Plus size={16}/> Add inventory item</button></>}</div></div>
    <div className="metric-grid"><Metric label="Active items" value={String(items.length)} hint={lowStock ? `${lowStock} need reorder` : 'All items above threshold'} icon={<Package size={17}/>} /><Metric label="Low-stock items" value={String(lowStock)} hint="At or below reorder level" icon={<AlertTriangle size={17}/>} /><Metric label="Stock value" value={money(stockValue)} hint="At saved unit costs" icon={<Package size={17}/>} /><Metric label="Usage this month" value={money(usageThisMonth)} hint="Recorded clinical usage" icon={<ArrowDownToLine size={17}/>} /></div>
    <div className="panel inventory-panel"><div className="panel-head inventory-toolbar"><div><h3>Stock catalogue</h3><span>{filtered.length} active {filtered.length === 1 ? 'item' : 'items'} in this clinic</span></div><div className="inventory-filters"><label className="inventory-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search items, SKU or supplier" /></label><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select value={stockFilter} onChange={event => setStockFilter(event.target.value)}><option value="all">All stock status</option><option value="low">Low stock</option><option value="healthy">Healthy stock</option></select></div></div>
      {loading && <div className="empty-state"><p>Loading inventory…</p></div>}
      {!loading && error && <div className="empty-state"><AlertTriangle size={20}/><p>{error}</p><button className="ghost small" onClick={() => void load()}>Try again</button></div>}
      {!loading && !error && !filtered.length && <div className="empty-state"><Package size={22}/><p>{items.length ? 'No items match the current filters.' : 'Your inventory is empty. Add the first clinic material to begin tracking stock.'}</p>{canManage && !items.length && <button className="primary" onClick={() => setItemOpen(true)}><Plus size={15}/> Add inventory item</button>}</div>}
      {!loading && !error && filtered.length > 0 && <div className="inventory-table-wrap"><div className="inventory-native-table"><div className="inventory-native-row inventory-native-head"><span>Item</span><span>Category</span><span>Current stock</span><span>Reorder level</span><span>Batch / expiry</span><span>Supplier</span><span /></div>{filtered.map(item => { const low = item.current_stock <= item.reorder_threshold; return <div className="inventory-native-row" key={item.id}><span><b>{item.name}</b><small>{item.sku || 'No SKU'} · {item.unit}</small></span><span><em className="inventory-badge">{item.category}</em></span><span><b>{item.current_stock.toLocaleString('en-IN')}</b> <small>{item.unit}</small>{low && <em className="inventory-low">LOW STOCK</em>}</span><span>{item.reorder_threshold.toLocaleString('en-IN')} {item.unit}</span><span>{item.batch_number || '—'}{item.expiry_date && <small>Exp {new Date(item.expiry_date).toLocaleDateString('en-IN')}</small>}</span><span>{item.supplier || '—'}</span><span className="inventory-row-actions">{canManage && <button className="ghost small" onClick={() => setUsageItem(item)}>Use</button>}</span></div> })}</div></div>}
    </div>
    {itemOpen && <div className="inventory-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setItemOpen(false)}><form className="panel inventory-modal" onSubmit={createItem}><div className="panel-head"><div><h3>Add inventory item</h3><span>Opening stock is recorded as a movement so the balance remains auditable.</span></div><button type="button" className="icon-btn" onClick={() => setItemOpen(false)} aria-label="Close"><X size={17}/></button></div><div className="form-grid two"><label>Item name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>Category<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{categories.map(item => <option key={item}>{item}</option>)}</select></label><label>SKU / internal code<input value={form.sku} onChange={event => setForm({ ...form, sku: event.target.value })}/></label><label>Unit<input value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })}/></label><label>Initial quantity<input type="number" min="0" step="0.001" value={form.initialQuantity} onChange={event => setForm({ ...form, initialQuantity: event.target.value })}/></label><label>Reorder level<input type="number" min="0" step="0.001" value={form.reorderThreshold} onChange={event => setForm({ ...form, reorderThreshold: event.target.value })}/></label><label>Unit cost<input type="number" min="0" step="0.01" value={form.unitCost} onChange={event => setForm({ ...form, unitCost: event.target.value })}/></label><label>Supplier<input value={form.supplier} onChange={event => setForm({ ...form, supplier: event.target.value })}/></label><label>Batch number<input value={form.batchNumber} onChange={event => setForm({ ...form, batchNumber: event.target.value })}/></label><label>Expiry date<input type="date" value={form.expiryDate} onChange={event => setForm({ ...form, expiryDate: event.target.value })}/></label><label className="inventory-full-field">Storage notes<textarea value={form.storageNotes} onChange={event => setForm({ ...form, storageNotes: event.target.value })}/></label><label className="inventory-full-field">Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label></div><div className="settings-actions"><button type="button" className="ghost" onClick={() => setItemOpen(false)}>Cancel</button><button className="primary"><Plus size={15}/> Save item</button></div></form></div>}
    {usagePickerOpen && <div className="inventory-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setUsagePickerOpen(false)}><div className="panel inventory-modal compact-modal"><div className="panel-head"><div><h3>Choose an item</h3><span>Select the material or medicine being used.</span></div><button type="button" className="icon-btn" onClick={() => setUsagePickerOpen(false)} aria-label="Close"><X size={17}/></button></div><div className="inventory-picker-list">{items.map(item => <button type="button" className="inventory-picker-row" key={item.id} onClick={() => { setUsagePickerOpen(false); setUsageItem(item) }}><span><b>{item.name}</b><small>{item.current_stock} {item.unit} available · {item.category}</small></span><ArrowDownToLine size={16}/></button>)}</div></div></div>}
    {usageItem && <div className="inventory-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setUsageItem(null)}><form className="panel inventory-modal compact-modal" onSubmit={recordMovement}><div className="panel-head"><div><h3>Record stock movement</h3><span>{usageItem.name} · {usageItem.current_stock} {usageItem.unit} available</span></div><button type="button" className="icon-btn" onClick={() => setUsageItem(null)} aria-label="Close"><X size={17}/></button></div><div className="form-grid two"><label>Movement<select name="movementType" defaultValue="usage">{movementTypes.map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><label>Quantity<input name="quantity" required type="number" min="0.001" step="0.001"/></label><label>Date<input name="movementDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label><label>Patient ID <span className="field-help">optional</span><input name="patientId" placeholder="Link later if available"/></label><label className="inventory-full-field">Reason<input name="reason" placeholder="e.g. RCT 16, expired stock, count correction"/></label></div><div className="settings-actions"><button type="button" className="ghost" onClick={() => setUsageItem(null)}>Cancel</button><button className="primary"><ArrowDownToLine size={15}/> Record movement</button></div></form></div>}
  </section>
}

function Metric({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: React.ReactNode }) { return <div className="metric"><div className="metric-icon">{icon}</div><span>{label}</span><b>{value}</b><small className="metric-hint">{hint}</small></div> }
