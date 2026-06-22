import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Calendar, LayoutGrid, Import, X, ChevronDown, ChevronUp, ZoomIn, ZoomOut, UserPlus, FilePlus, Settings, Lock, Unlock, LogIn, LogOut, Menu, Search, Copy, Check, Undo, Redo, FileText, Edit } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Types
export type ViewPermission = 'grid' | 'visual' | 'summary' | 'personal' | 'annotations';

export interface UserAccess {
  id: string;
  email: string;
  role: 'admin' | 'user';
  permissions: {
    canEdit: boolean;
    allowedViews: ViewPermission[];
    summaryEmployee?: string;
    personalEmployee?: string;
  };
  password?: string;
}

export interface CategoryGroup {
  id: string;
  name: string;
  color: string;
  rows: RowData[];
}

export interface RowData {
  id: string;
  type: 'employee' | 'subheader';
  name: string;
  rate: number;
  status: string;
  role?: string;
  shifts: Record<number, { start: string; end: string }>;
}

const PALETTE = ['#e6b8b7', '#b8cce4', '#d8e4bc', '#ccc1d9', '#fcd5b4', '#b7dee8', '#e4dfec', '#f2dcdb'];

const getNextFriday = () => {
  const d = new Date();
  const diff = 5 - d.getDay();
  d.setDate(d.getDate() + diff);
  if (diff < 0) d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
};

const formatDateDay = (d: Date) => {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

const getHours = (start: string, end: string) => {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;

  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // Next day assuming overnight shift
  return mins / 60;
};

const formatDecimalHours = (decimalHours: number) => {
  if (!decimalHours) return '';
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
};

const parseTimeInput = (val: string) => {
  if (!val) return '';
  const cleaned = val.replace(/[^\d:]/g, '');
  if (!cleaned) return '';
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    return `${parts[0].padStart(2, '0')}:${(parts[1] || '00').padStart(2, '0').slice(0, 2)}`;
  }
  if (cleaned.length <= 2) return `${cleaned.padStart(2, '0')}:00`;
  if (cleaned.length === 3) return `0${cleaned.slice(0, 1)}:${cleaned.slice(1, 3)}`;
  if (cleaned.length === 4) return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
  return cleaned;
};

const AutoResizingTextarea = React.memo(({ value, onChange, className, placeholder, disabled, ...rest }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  [key: string]: any;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      style={{ resize: 'none', overflow: 'hidden', display: 'block', width: '100%' }}
      {...rest}
    />
  );
});

const INITIAL_DATA: CategoryGroup[] = [
  {
    id: 'cat-1',
    name: 'BARRA CENTRAL',
    color: '#e6b8b7',
    rows: [
      {
        id: uuidv4(), type: 'employee', name: 'CLAUDIA PELU', rate: 10, status: 'PAGADO',
        shifts: {
          1: { start: '12:00', end: '20:00' },
          2: { start: '12:00', end: '20:00' },
          3: { start: '12:00', end: '20:00' },
        }
      },
      {
        id: uuidv4(), type: 'subheader', name: 'NOCHE', rate: 0, status: '', shifts: {}
      },
      {
        id: uuidv4(), type: 'employee', name: 'DANI VALLADOLID', rate: 10, status: 'PREPARADO',
        shifts: {
          1: { start: '21:00', end: '02:00' },
          2: { start: '21:00', end: '02:00' },
        }
      }
    ]
  },
  {
    id: 'cat-2',
    name: 'ESCENARIO',
    color: '#e6b8b7',
    rows: [
      {
        id: uuidv4(), type: 'employee', name: 'JAVI DADA', rate: 10, status: 'PAGADO',
        shifts: { 1: { start: '21:00', end: '07:00' } }
      }
    ]
  }
];

export default function App() {
  const [categories, setCategories] = useState<CategoryGroup[]>(() => {
    const saved = localStorage.getItem('gestor_categories');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_DATA;
  });
  const [startDate, setStartDate] = useState(getNextFriday());
  const [currentView, setCurrentView] = useState<'grid' | 'visual' | 'summary' | 'personal' | 'annotations'>('grid');

  // Annotations State
  const [annotations, setAnnotations] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('gestor_annotations');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);

  // PERSONAL View State
  const [selectedEmployeePersonalView, setSelectedEmployeePersonalView] = useState<string | null>(null);
  const [searchQueryPersonalView, setSearchQueryPersonalView] = useState<string>('');
  const [copiedPersonalViewShiftId, setCopiedPersonalViewShiftId] = useState<string | null>(null);
  const [copiedAllSuccess, setCopiedAllSuccess] = useState<boolean>(false);

  // Grid Selection & Mobile Hiding State
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [hideEmployeeColumnMobile, setHideEmployeeColumnMobile] = useState<boolean>(false);
  const [isPersonalHeaderShrunk, setIsPersonalHeaderShrunk] = useState<boolean>(false);

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getInitialEndDate = (start: string) => {
    const d = new Date(start);
    d.setDate(d.getDate() + 9);
    return d.toISOString().split('T')[0];
  };

  const [endDate, setEndDate] = useState(getInitialEndDate(getNextFriday()));

  const daysArray = useMemo(() => {
    const arr = [];
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    
    // Fallback: if endDate is before startDate, just show 1 day
    if (endObj < startObj) {
      arr.push(new Date(startObj));
      return arr;
    }

    const diffTime = Math.abs(endObj.getTime() - startObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Limit to max 31 days to prevent memory issues
    const numDays = Math.min(diffDays + 1, 31);

    for (let i = 0; i < numDays; i++) {
      const d = new Date(startObj);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [startDate, endDate]);

  // Actions
  const [dragSource, setDragSource] = useState<{ catId: string, rowIdx: number } | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ catId: string, rowIdx: number } | null>(null);

  const handleDragStart = (e: React.DragEvent, catId: string, rowIdx: number) => {
    setDragSource({ catId, rowIdx });
  };

  const handleDragOver = (e: React.DragEvent, catId: string, rowIdx: number) => {
    e.preventDefault();
    if (dragSource && dragSource.catId === catId) {
      setDragOverInfo({ catId, rowIdx });
    }
  };

  const handleDragLeave = () => {
    setDragOverInfo(null);
  };

  const handleDrop = (e: React.DragEvent, catId: string, rowIdx: number) => {
    e.preventDefault();
    if (dragSource && dragSource.catId === catId && dragSource.rowIdx !== rowIdx) {
      setCategories(prev => prev.map(c => {
        if (c.id !== catId) return c;
        const newRows = [...c.rows];
        const [draggedRow] = newRows.splice(dragSource.rowIdx, 1);
        newRows.splice(rowIdx, 0, draggedRow);
        return { ...c, rows: newRows };
      }));
    }
    setDragSource(null);
    setDragOverInfo(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverInfo(null);
  };

  const updateRow = (catId: string, rowId: string, updater: (r: RowData) => RowData) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return { ...c, rows: c.rows.map(r => r.id === rowId ? updater(r) : r) };
    }));
  };

  const handleShiftChange = (catId: string, rowId: string, dayIdx: number, field: 'start' | 'end', val: string) => {
    updateRow(catId, rowId, r => ({
      ...r,
      shifts: {
        ...r.shifts,
        [dayIdx]: { ...(r.shifts[dayIdx] || { start: '', end: '' }), [field]: val }
      }
    }));
  };

  const handleShiftBlur = (catId: string, rowId: string, dayIdx: number, field: 'start' | 'end', val: string) => {
    handleShiftChange(catId, rowId, dayIdx, field, parseTimeInput(val));
  };

  const toggleVisualHour = (catId: string, empName: string, h: number, isDeselect: boolean) => {
    setCategories(prev => {
      const newCats = [...prev];
      const catIdx = newCats.findIndex(c => c.id === catId);
      if (catIdx === -1) return prev;
      
      const cat = { ...newCats[catIdx] };
      const rows = [...cat.rows];
      
      const formatHour = (val: number) => {
         const hour = Math.floor(val);
         const min = Math.round((val - hour) * 60);
         const displayHour = hour >= 24 ? hour - 24 : hour;
         return `${displayHour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      };

      const getShiftBounds = (shift: any) => {
          const startParts = shift.start.split(':').map(Number);
          const endParts = shift.end.split(':').map(Number);
          let sVal = startParts[0] + startParts[1]/60;
          let eVal = endParts[0] + endParts[1]/60;
          
          if (sVal < 5) sVal += 24;
          if (eVal <= sVal && eVal < 12) eVal += 24;
          if (eVal <= sVal) eVal += 24;
          return [sVal, eVal];
      };
      
      const empRowIndices = rows.map((r, idx) => r.name.trim().toLowerCase() === empName.trim().toLowerCase() ? idx : -1).filter(idx => idx !== -1);
      
      if (isDeselect) {
         for (const idx of empRowIndices) {
            const r = rows[idx];
            const shift = r.shifts[selectedDayIdx];
            if (shift && shift.start && shift.end) {
               const [sVal, eVal] = getShiftBounds(shift);
               
               if (h >= sVal && h < eVal) {
                  if (sVal === h && eVal === h + 1) {
                     const newShifts = { ...r.shifts };
                     delete newShifts[selectedDayIdx];
                     rows[idx] = { ...r, shifts: newShifts };
                  } else if (sVal === h) {
                     rows[idx] = { ...r, shifts: { ...r.shifts, [selectedDayIdx]: { ...shift, start: formatHour(h + 1) } } };
                  } else if (eVal === h + 1) {
                     rows[idx] = { ...r, shifts: { ...r.shifts, [selectedDayIdx]: { ...shift, end: formatHour(h) } } };
                  } else {
                     // Split
                     rows[idx] = { ...r, shifts: { ...r.shifts, [selectedDayIdx]: { ...shift, end: formatHour(h) } } };
                     const emptyRowIdx = empRowIndices.find(i => !rows[i].shifts[selectedDayIdx]);
                     if (emptyRowIdx !== undefined) {
                        rows[emptyRowIdx] = { ...rows[emptyRowIdx], shifts: { ...rows[emptyRowIdx].shifts, [selectedDayIdx]: { start: formatHour(h + 1), end: formatHour(eVal) } } };
                     } else {
                        const newRow = {
                           id: crypto.randomUUID(),
                           type: 'employee' as const,
                           name: r.name,
                           role: r.role,
                           rate: r.rate,
                           status: r.status,
                           shifts: { [selectedDayIdx]: { start: formatHour(h + 1), end: formatHour(eVal) } }
                        };
                        rows.splice(idx + 1, 0, newRow);
                     }
                  }
                  break;
               }
            }
         }
      } else {
         let extended = false;
         for (const idx of empRowIndices) {
            const r = rows[idx];
            const shift = r.shifts[selectedDayIdx];
            if (shift && shift.start && shift.end) {
               const [sVal, eVal] = getShiftBounds(shift);
               if (eVal === h) {
                  rows[idx] = { ...r, shifts: { ...r.shifts, [selectedDayIdx]: { ...shift, end: formatHour(h + 1) } } };
                  extended = true;
                  break;
               } else if (sVal === h + 1) {
                  rows[idx] = { ...r, shifts: { ...r.shifts, [selectedDayIdx]: { ...shift, start: formatHour(h) } } };
                  extended = true;
                  break;
               }
            }
         }
         
         if (!extended) {
             const emptyRowIdx = empRowIndices.find(i => !rows[i].shifts[selectedDayIdx]);
             if (emptyRowIdx !== undefined) {
                 rows[emptyRowIdx] = { ...rows[emptyRowIdx], shifts: { ...rows[emptyRowIdx].shifts, [selectedDayIdx]: { start: formatHour(h), end: formatHour(h + 1) } } };
             } else {
                 if (empRowIndices.length > 0) {
                     const blueprint = rows[empRowIndices[0]];
                     const newRow = {
                        id: crypto.randomUUID(),
                        type: 'employee' as const,
                        name: blueprint.name,
                        role: blueprint.role,
                        rate: blueprint.rate,
                        status: blueprint.status,
                        shifts: { [selectedDayIdx]: { start: formatHour(h), end: formatHour(h + 1) } }
                     };
                     rows.splice(empRowIndices[empRowIndices.length - 1] + 1, 0, newRow);
                 }
             }
         }
      }
      
      cat.rows = rows;
      newCats[catIdx] = cat;
      return newCats;
    });
  };

  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  const [selectedEmployeeNameForModal, setSelectedEmployeeNameForModal] = useState<string | null>(null);
  const [daySelectPopoverOpen, setDaySelectPopoverOpen] = useState(false);
  const [visualZoom, setVisualZoom] = useState(100);
  const [gridZoom, setGridZoom] = useState(100);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const visualContainerRef = useRef<HTMLDivElement>(null);

  const zoomRef = useRef({ gridZoom, visualZoom });
  useEffect(() => {
    zoomRef.current = { gridZoom, visualZoom };
  }, [gridZoom, visualZoom]);

  useEffect(() => {
    const attachPinchZoom = (element: HTMLDivElement | null, isGrid: boolean) => {
      if (!element) return () => {};

      let initialDist = 0;
      let initialZoom = 100;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          initialDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          initialZoom = isGrid ? zoomRef.current.gridZoom : zoomRef.current.visualZoom;
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && initialDist > 0) {
          e.preventDefault();
          const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const factor = currentDist / initialDist;
          
          if (isGrid) {
            const nextZoom = Math.min(200, Math.max(20, Math.round(initialZoom * factor)));
            setGridZoom(nextZoom);
          } else {
            const nextZoom = Math.min(400, Math.max(100, Math.round(initialZoom * factor)));
            setVisualZoom(nextZoom);
          }
        }
      };

      const handleTouchEnd = () => {
        initialDist = 0;
      };

      element.addEventListener('touchstart', handleTouchStart, { passive: false });
      element.addEventListener('touchmove', handleTouchMove, { passive: false });
      element.addEventListener('touchend', handleTouchEnd);

      return () => {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchmove', handleTouchMove);
        element.removeEventListener('touchend', handleTouchEnd);
      };
    };

    const cleanupGrid = attachPinchZoom(gridContainerRef.current, true);
    const cleanupVisual = attachPinchZoom(visualContainerRef.current, false);

    return () => {
      cleanupGrid();
      cleanupVisual();
    };
  }, [currentView]);

  // Auth State
  const [currentUser, setCurrentUser] = useState<UserAccess | null>(() => {
    const saved = localStorage.getItem('gestor_current_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  });
  const isAdmin = currentUser?.role === 'admin';
  const canEdit = currentUser ? currentUser.permissions.canEdit : true;

  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'users'>('general');
  const [usersList, setUsersList] = useState<UserAccess[]>(() => {
    const saved = localStorage.getItem('gestor_users_list');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      {
        id: uuidv4(),
        email: 'daviidjg1991@gmail.com',
        role: 'admin',
        permissions: { canEdit: true, allowedViews: ['grid', 'visual', 'summary', 'personal'] },
        password: '637050616'
      }
    ];
  });

  // Admin Password Change State
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [confirmAdminPasswordInput, setConfirmAdminPasswordInput] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // Firestore & local persistence states
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Undo/Redo History States
  const [history, setHistory] = useState<CategoryGroup[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoingOrRedoing = useRef(false);

  // Category color picker active cat state
  const [activeColorPickerCatId, setActiveColorPickerCatId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialLoadComplete) return;

    if (isUndoingOrRedoing.current) {
      isUndoingOrRedoing.current = false;
      return;
    }

    const timer = setTimeout(() => {
      setHistory(prev => {
        const nextHistory = prev.slice(0, historyIndex + 1);
        if (nextHistory.length > 0 && JSON.stringify(nextHistory[nextHistory.length - 1]) === JSON.stringify(categories)) {
          return prev;
        }
        const newHistory = [...nextHistory, categories];
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [categories, initialLoadComplete]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      isUndoingOrRedoing.current = true;
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setCategories(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      isUndoingOrRedoing.current = true;
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setCategories(history[nextIndex]);
    }
  };

  const updateCategoryColor = (catId: string, color: string) => {
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, color } : c));
  };

  // Flatten categories and rows to get unique global indices
  const flatRows = useMemo(() => {
    const list: { catId: string; rowId: string; type: 'employee' | 'subheader'; name: string; globalIdx: number }[] = [];
    let globalIdx = 0;
    categories.forEach(cat => {
      cat.rows.forEach(row => {
        list.push({
          catId: cat.id,
          rowId: row.id,
          type: row.type,
          name: row.name,
          globalIdx: globalIdx++
        });
      });
    });
    return list;
  }, [categories]);

  const focusCell = (targetRow: number, targetCol: number, direction: string) => {
    const totalRows = flatRows.length;
    const maxColIdx = 2 + 2 * daysArray.length;

    let r = targetRow;
    let c = targetCol;

    if (r < 0) r = 0;
    if (r >= totalRows) r = totalRows - 1;

    if (c < 0) c = 0;
    if (c > maxColIdx) c = maxColIdx;

    const queryAndFocus = (currRow: number, currCol: number): boolean => {
      const selector = `[data-row-idx="${currRow}"][data-col-idx="${currCol}"]`;
      const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (el) {
        el.focus();
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          (el as HTMLInputElement).select();
        }
        return true;
      }
      return false;
    };

    if (queryAndFocus(r, c)) return;

    if (direction === 'ArrowUp' || direction === 'ArrowDown') {
      const step = direction === 'ArrowUp' ? -1 : 1;
      let tempRow = r;
      while (tempRow >= 0 && tempRow < totalRows) {
        if (queryAndFocus(tempRow, c)) return;
        tempRow += step;
      }
      queryAndFocus(r, 0);
    } else if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
      const step = direction === 'ArrowLeft' ? -1 : 1;
      let tempCol = c;
      while (tempCol >= 0 && tempCol <= maxColIdx) {
        if (queryAndFocus(r, tempCol)) return;
        tempCol += step;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, globalRowIdx: number, colIdx: number) => {
    const { key } = e;
    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key);
    if (!isArrow) return;

    e.preventDefault();

    let nextRow = globalRowIdx;
    let nextCol = colIdx;

    if (key === 'ArrowUp') {
      nextRow = globalRowIdx - 1;
    } else if (key === 'ArrowDown') {
      nextRow = globalRowIdx + 1;
    } else if (key === 'ArrowLeft') {
      nextCol = colIdx - 1;
    } else if (key === 'ArrowRight') {
      nextCol = colIdx + 1;
    }

    focusCell(nextRow, nextCol, key);
  };

  // Load categories and users from Cloud Firestore on mount
  React.useEffect(() => {
    const loadData = async () => {
      setSyncStatus('loading');
      try {
        // Load categories
        const categoriesDocRef = doc(db, 'schedule', 'categories');
        const categoriesSnap = await getDoc(categoriesDocRef);
        if (categoriesSnap.exists()) {
          setCategories(categoriesSnap.data().data);
        } else {
          // If not in firestore, initialize it with current state
          await setDoc(categoriesDocRef, { data: categories });
        }

        // Load annotations
        const annotationsDocRef = doc(db, 'schedule', 'annotations');
        const annotationsSnap = await getDoc(annotationsDocRef);
        if (annotationsSnap.exists()) {
          setAnnotations(annotationsSnap.data().data);
        } else {
          await setDoc(annotationsDocRef, { data: annotations });
        }

        // Load users list
        const usersDocRef = doc(db, 'schedule', 'users');
        const usersSnap = await getDoc(usersDocRef);
        if (usersSnap.exists()) {
          const loadedUsers = usersSnap.data().data as UserAccess[];
          let migrated = false;
          const updatedUsers = loadedUsers.map(u => {
            if (u.role === 'admin' && !u.permissions.allowedViews.includes('personal')) {
              migrated = true;
              return {
                ...u,
                permissions: {
                  ...u.permissions,
                  allowedViews: Array.from(new Set([...u.permissions.allowedViews, 'personal', 'annotations']))
                }
              };
            }
            return u;
          });
          setUsersList(updatedUsers);
          if (migrated) {
            await setDoc(usersDocRef, { data: updatedUsers });
          }
        } else {
          // Initialize it with current state
          await setDoc(usersDocRef, { data: usersList });
        }
        setSyncStatus('saved');
        setInitialLoadComplete(true);
      } catch (error) {
        console.error("Error loading data from Firestore:", error);
        setSyncStatus('error');
        // Fallback to local storage (already initialized in state)
        setInitialLoadComplete(true);
      }
    };

    loadData();
  }, []);

  // Save annotations to Firestore on change (debounced)
  React.useEffect(() => {
    if (!initialLoadComplete) return;

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const annotationsDocRef = doc(db, 'schedule', 'annotations');
        await setDoc(annotationsDocRef, { data: annotations });
        setSyncStatus('saved');
      } catch (error) {
        console.error("Error saving annotations to Firestore:", error);
        setSyncStatus('error');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [annotations, initialLoadComplete]);

  // Save categories to Firestore on change (debounced)
  React.useEffect(() => {
    if (!initialLoadComplete) return;

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const categoriesDocRef = doc(db, 'schedule', 'categories');
        await setDoc(categoriesDocRef, { data: categories });
        setSyncStatus('saved');
      } catch (error) {
        console.error("Error saving categories to Firestore:", error);
        setSyncStatus('error');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [categories, initialLoadComplete]);

  // Save usersList to Firestore on change (debounced)
  React.useEffect(() => {
    if (!initialLoadComplete) return;

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const usersDocRef = doc(db, 'schedule', 'users');
        await setDoc(usersDocRef, { data: usersList });
        setSyncStatus('saved');
      } catch (error) {
        console.error("Error saving users list to Firestore:", error);
        setSyncStatus('error');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [usersList, initialLoadComplete]);

  // Persist State to LocalStorage (as offline cache)
  React.useEffect(() => {
    localStorage.setItem('gestor_categories', JSON.stringify(categories));
  }, [categories]);

  React.useEffect(() => {
    localStorage.setItem('gestor_users_list', JSON.stringify(usersList));
  }, [usersList]);

  React.useEffect(() => {
    localStorage.setItem('gestor_annotations', JSON.stringify(annotations));
  }, [annotations]);

  React.useEffect(() => {
    if (currentUser) {
      localStorage.setItem('gestor_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('gestor_current_user');
    }
  }, [currentUser]);

  React.useEffect(() => {
    if (currentUser) {
      const updatedUser = usersList.find(u => u.id === currentUser.id);
      if (updatedUser && JSON.stringify(updatedUser) !== JSON.stringify(currentUser)) {
        setCurrentUser(updatedUser);
      }
    }
  }, [usersList, currentUser]);

  const handleAdminPasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput.length < 4) {
      setPasswordChangeError('La contraseña debe tener al menos 4 caracteres');
      setPasswordChangeSuccess('');
      return;
    }
    if (adminPasswordInput !== confirmAdminPasswordInput) {
      setPasswordChangeError('Las contraseñas no coinciden');
      setPasswordChangeSuccess('');
      return;
    }
    
    // Update admin user password in users list
    const updatedUsers = usersList.map(u => u.email === 'daviidjg1991@gmail.com' ? { ...u, password: adminPasswordInput } : u);
    setUsersList(updatedUsers);
    
    // Update current user context if logged in as admin
    if (currentUser?.email === 'daviidjg1991@gmail.com') {
      setCurrentUser(prev => prev ? { ...prev, password: adminPasswordInput } : null);
    }

    setPasswordChangeSuccess('Contraseña del administrador actualizada correctamente');
    setPasswordChangeError('');
    setAdminPasswordInput('');
    setConfirmAdminPasswordInput('');
  };
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = usersList.find(u => u.email === emailInput);
    if (user) {
      const expectedPassword = user.password || (user.role === 'admin' ? '637050616' : '123456');
      if (passInput === expectedPassword) {
         setCurrentUser(user);
         setLoginError('');
         setEmailInput('');
         setPassInput('');
         
         // Check if current view is allowed for this user
         if (!user.permissions.allowedViews.includes(currentView)) {
            if (user.permissions.allowedViews.length > 0) {
               setCurrentView(user.permissions.allowedViews[0]);
            }
         }
      } else {
         setLoginError('Contraseña incorrecta');
      }
    } else {
      setLoginError('Usuario no encontrado');
    }
  };

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserCanEdit, setNewUserCanEdit] = useState(false);
  const [newUserViews, setNewUserViews] = useState<ViewPermission[]>(['grid']);
  const [newUserSummaryEmployee, setNewUserSummaryEmployee] = useState<string>('all');
  const [newUserPersonalEmployee, setNewUserPersonalEmployee] = useState<string>('all');

  const [editingUser, setEditingUser] = useState<UserAccess | null>(null);
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserCanEdit, setEditUserCanEdit] = useState(false);
  const [editUserViews, setEditUserViews] = useState<ViewPermission[]>(['grid']);
  const [editUserSummaryEmployee, setEditUserSummaryEmployee] = useState<string>('all');
  const [editUserPersonalEmployee, setEditUserPersonalEmployee] = useState<string>('all');

  const openEditUser = (user: UserAccess) => {
    setEditingUser(user);
    setEditUserEmail(user.email);
    setEditUserPassword(user.password || '');
    setEditUserCanEdit(user.permissions.canEdit);
    setEditUserViews(user.permissions.allowedViews);
    setEditUserSummaryEmployee(user.permissions.summaryEmployee || 'all');
    setEditUserPersonalEmployee(user.permissions.personalEmployee || 'all');
  };

  const handleSaveEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editUserEmail.trim()) return;
    setUsersList(usersList.map(u => u.id === editingUser.id ? {
      ...u,
      email: editUserEmail,
      password: editUserPassword,
      permissions: {
        canEdit: editUserCanEdit,
        allowedViews: editUserViews,
        summaryEmployee: editUserSummaryEmployee === 'all' ? undefined : editUserSummaryEmployee,
        personalEmployee: editUserPersonalEmployee === 'all' ? undefined : editUserPersonalEmployee
      }
    } : u));
    
    if (currentUser?.id === editingUser.id) {
       setCurrentUser(prev => prev ? {
         ...prev,
         email: editUserEmail,
         password: editUserPassword,
         permissions: {
           canEdit: editUserCanEdit,
           allowedViews: editUserViews,
           summaryEmployee: editUserSummaryEmployee === 'all' ? undefined : editUserSummaryEmployee,
           personalEmployee: editUserPersonalEmployee === 'all' ? undefined : editUserPersonalEmployee
         }
       } : null);
    }
    
    setEditingUser(null);
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim()) return;
    setUsersList([...usersList, {
      id: uuidv4(),
      email: newUserEmail,
      role: 'user',
      permissions: {
        canEdit: newUserCanEdit,
        allowedViews: newUserViews,
        summaryEmployee: newUserSummaryEmployee === 'all' ? undefined : newUserSummaryEmployee,
        personalEmployee: newUserPersonalEmployee === 'all' ? undefined : newUserPersonalEmployee
      },
      password: newUserPassword
    }]);
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserCanEdit(false);
    setNewUserViews(['grid']);
    setNewUserSummaryEmployee('all');
    setNewUserPersonalEmployee('all');
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setCategories([
      ...categories,
      {
        id: uuidv4(),
        name: newCategoryName.trim().toUpperCase(),
        color: PALETTE[categories.length % PALETTE.length],
        rows: []
      }
    ]);
    setNewCategoryName('');
    setNewCategoryModalOpen(false);
  };

  const addEmployee = (catId: string, insertAtIdx?: number) => {
    const newId = uuidv4();
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      const newRows = [...c.rows];
      const newRow = { id: newId, type: 'employee' as const, name: '', rate: 10, status: '', role: '', shifts: {} };
      if (insertAtIdx !== undefined) {
        newRows.splice(insertAtIdx, 0, newRow);
      } else {
        newRows.push(newRow);
      }
      return { ...c, rows: newRows };
    }));
    setSelectedRowId(newId);
  };

  const addSubheader = (catId: string, insertAtIdx?: number) => {
    const newId = uuidv4();
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      const newRows = [...c.rows];
      const newRow = { id: newId, type: 'subheader' as const, name: 'NUEVA SECCIÓN...', rate: 0, status: '', role: '', shifts: {} };
      if (insertAtIdx !== undefined) {
        newRows.splice(insertAtIdx, 0, newRow);
      } else {
        newRows.push(newRow);
      }
      return { ...c, rows: newRows };
    }));
    setSelectedRowId(newId);
  };

  const deleteRow = (catId: string, rowId: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return { ...c, rows: c.rows.filter(r => r.id !== rowId) };
    }));
  };

  const deleteCategory = (catId: string) => {
    if (window.confirm("¿Estás seguro de eliminar esta categoría completa?")) {
      setCategories(prev => prev.filter(c => c.id !== catId));
    }
  };

  // Reusable CSS patterns
  const cellBorder = "border-[1px] border-slate-400 m-0 p-0 min-h-[20px] h-auto";
  const headerCell = `border-[1px] border-slate-400 font-semibold px-1 py-1 min-h-[20px] h-auto align-middle`;
  const plainInput = "block w-full min-h-[20px] h-auto border-none outline-none bg-transparent hover:bg-slate-50 focus:bg-blue-100 text-center text-[10px] sm:text-[11px] font-medium tracking-tighter transition-colors px-0 py-0.5 m-0 leading-tight";

  const nameColumnWidth = useMemo(() => {
    let maxLen = 10; // At least fit "Nombre..." placeholder
    categories.forEach(cat => {
      cat.rows.forEach(row => {
        if (row.name && row.name.length > maxLen) {
          maxLen = row.name.length;
        }
      });
    });
    
    // Adapt to the longest name dynamically without hard limits
    // px-2 gives 8px left and 8px right padding.
    // 8.5 pixels per character on average for uppercase font-semibold
    return maxLen * 8.5 + 16;
  }, [categories, isMobile]);

  // Global Sums
  let globalCost = 0;
  const dailyCosts = new Array(daysArray.length).fill(0);

  const employeeStats = useMemo(() => {
    const stats: Record<string, { 
      name: string; 
      hours: number; 
      totalEuros: number; 
      allPaid: boolean;
      shiftsData: { day: Date; start: string; end: string; hours: number; rate: number; total: number; catName: string }[] 
    }> = {};
    
    categories.forEach(cat => {
      cat.rows.forEach(row => {
        if (row.type === 'employee' && row.name.trim()) {
          const nameKey = row.name.trim().toLowerCase();
          
          let rowHours = 0;
          const rowShiftsData: typeof stats[string]['shiftsData'] = [];

          for (let d = 0; d < daysArray.length; d++) {
            const s = row.shifts[d];
            if (s && s.start && s.end) {
              const h = getHours(s.start, s.end);
              rowHours += h;
              rowShiftsData.push({
                day: daysArray[d],
                start: s.start,
                end: s.end,
                hours: h,
                rate: row.rate,
                total: h * row.rate,
                catName: cat.name
              });
            }
          }
          
          const rowTotal = rowHours * row.rate;

          if (!stats[nameKey]) {
            stats[nameKey] = { name: row.name.trim(), hours: 0, totalEuros: 0, allPaid: true, shiftsData: [] };
          }
          stats[nameKey].hours += rowHours;
          stats[nameKey].totalEuros += rowTotal;
          stats[nameKey].shiftsData.push(...rowShiftsData);
          
          if (row.status !== 'PAGADO') {
            stats[nameKey].allPaid = false;
          }
        }
      });
    });

    let result = Object.values(stats).sort((a, b) => a.name.localeCompare(b.name));
    
    if (currentUser && currentUser.role !== 'admin' && currentUser.permissions.summaryEmployee) {
      result = result.filter(emp => emp.name === currentUser.permissions.summaryEmployee);
    }
    
    return result;
  }, [categories, daysArray, currentUser]);

  // Memoized data for PERSONAL tab
  const personalViewEmployees = useMemo(() => {
    const map: Record<string, {
      name: string;
      categories: Set<string>;
      shifts: {
        id: string;
        catName: string;
        catColor: string;
        day: Date;
        start: string;
        end: string;
        dayIdx: number;
        rate: number;
      }[];
    }> = {};

    categories.forEach(cat => {
      cat.rows.forEach(row => {
        if (row.type === 'employee' && row.name.trim()) {
          const nameKey = row.name.trim().toLowerCase();
          if (!map[nameKey]) {
            map[nameKey] = {
              name: row.name.trim(),
              categories: new Set(),
              shifts: []
            };
          }
          map[nameKey].categories.add(cat.name);

          for (let d = 0; d < daysArray.length; d++) {
            const s = row.shifts[d];
            if (s && s.start && s.end) {
              map[nameKey].shifts.push({
                id: `${row.id}-${d}`,
                catName: cat.name,
                catColor: cat.color,
                day: daysArray[d],
                start: s.start,
                end: s.end,
                dayIdx: d,
                rate: row.rate
              });
            }
          }
        }
      });
    });

    let result = Object.values(map)
      .map(emp => {
        const sortedShifts = [...emp.shifts].sort((a, b) => {
          if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
          return a.start.localeCompare(b.start);
        });
        return {
          name: emp.name,
          hasMultipleCategories: emp.categories.size > 1,
          shifts: sortedShifts,
          categories: Array.from(emp.categories),
          totalHours: sortedShifts.reduce((acc, s) => acc + getHours(s.start, s.end), 0)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
      
    if (currentUser && currentUser.role !== 'admin' && currentUser.permissions.personalEmployee) {
      result = result.filter(emp => emp.name === currentUser.permissions.personalEmployee);
    }
    
    return result;
  }, [categories, daysArray, currentUser]);

  const toggleEmployeePaidStatus = (empName: string, setPaid: boolean) => {
    setCategories(prev => prev.map(cat => ({
      ...cat,
      rows: cat.rows.map(row => {
        if (row.type === 'employee' && row.name.trim().toLowerCase() === empName.trim().toLowerCase()) {
          return { ...row, status: setPaid ? 'PAGADO' : '' };
        }
        return row;
      })
    })));
  };

  const totalCostFromStats = useMemo(() => {
    return employeeStats.reduce((sum, emp) => sum + emp.totalEuros, 0);
  }, [employeeStats]);

  const formatVisualHour = (h: number) => {
    const val = h >= 24 ? h - 24 : h;
    return val.toString().padStart(2, '0');
  };

  const visualGroups = useMemo(() => {
    const groups: { catId: string; catName: string; catColor: string; employees: any[] }[] = [];
    const catMap = new Map<string, any>();
    const empMap = new Map<string, any>();

    categories.forEach(cat => {
      cat.rows.forEach(row => {
        if (row.type === 'employee' && row.name.trim()) {
           const nameKey = row.name.trim().toLowerCase();
           
           const shift = row.shifts[selectedDayIdx];
           let startVal = -1;
           let endVal = -1;
           if (shift && shift.start && shift.end) {
              const startParts = shift.start.split(':').map(Number);
              const endParts = shift.end.split(':').map(Number);
              startVal = startParts[0] + startParts[1]/60;
              endVal = endParts[0] + endParts[1]/60;
              
              if (startVal < 5) startVal += 24;
              if (endVal <= startVal && endVal < 12) endVal += 24;
              if (endVal <= startVal) endVal += 24;
           }

           if (!empMap.has(nameKey)) {
             const empRecord = {
               id: row.id,
               name: row.name,
               catId: cat.id,
               role: row.role || '',
               shifts: [] as { start: number; end: number; color: string; catId: string; rowId: string }[]
             };
             empMap.set(nameKey, empRecord);

             if (!catMap.has(cat.id)) {
                const group = { catId: cat.id, catName: cat.name, catColor: cat.color, employees: [] as any[] };
                catMap.set(cat.id, group);
                groups.push(group);
             }
             catMap.get(cat.id).employees.push(empRecord);
           } else {
             // If employee already exists, just update role if it was empty
             const existing = empMap.get(nameKey);
             if (!existing.role && row.role) existing.role = row.role;
           }

           if (startVal >= 0 && endVal >= 0) {
             empMap.get(nameKey).shifts.push({ start: startVal, end: endVal, color: cat.color, catId: cat.id, rowId: row.id });
           }
        }
      });
    });

    return groups;
  }, [categories, selectedDayIdx]);

  const visualHours = useMemo(() => {
    let minH = 34; // max possible
    let maxH = 0;  // min possible
    let hasShifts = false;

    visualGroups.forEach(group => {
      group.employees.forEach(emp => {
        emp.shifts.forEach((s: any) => {
          const shiftStart = Math.floor(s.start);
          const shiftEnd = Math.ceil(s.end);
          if (shiftStart < minH) minH = shiftStart;
          if (shiftEnd > maxH) maxH = shiftEnd;
          hasShifts = true;
        });
      });
    });

    if (!hasShifts) {
      return Array.from({length: 12}, (_, i) => 8 + i);
    }
    
    // Add 1 hour buffer on each end
    minH = Math.max(5, minH - 1);
    maxH = Math.min(34, maxH); // Math.ceil already provides 1 empty box after

    if (minH > maxH) {
        minH = 8;
        maxH = 20;
    }

    const length = maxH - minH + 1;
    return Array.from({ length }, (_, i) => minH + i);
  }, [visualGroups]);


  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen w-full bg-slate-50 font-sans items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm border border-slate-200">
          <div className="flex flex-col items-center mb-6">
            <div className="mb-3">
              <img src="/logo.png" alt="MALAMIA Logo" className="w-20 h-20 object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 text-center leading-tight">MALAMIA</h1>
            <p className="text-slate-500 text-sm mt-1">Inicia sesión para continuar</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
              <input 
                autoFocus
                type="email" 
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="usuario@ejemplo.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña</label>
              <input 
                type="password" 
                value={passInput}
                onChange={(e) => setPassInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="••••••••"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-sm font-medium">{loginError}</p>
            )}
            <button 
              type="submit"
              className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-bold shadow-sm"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-100 font-sans overflow-hidden">
      {/* Top Banner Toolbar */}
      <div className="bg-white px-6 py-3 md:py-4 border-b shadow-sm shrink-0 relative z-50">
        <div className="flex items-center justify-between">
          {/* Left: Logo */}
          <div 
            className="flex items-center gap-3 text-slate-800 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => window.location.reload()}
            title="Inicio"
          >
            <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-slate-50 border border-slate-100 p-1 shadow-sm">
              <img src="/favicon.png" alt="Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight">MALAMIA</h1>
            </div>
          </div>

          {/* Middle (Desktop Only): View Switcher */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('grid')) && (
              <button 
                onClick={() => setCurrentView('grid')} 
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${currentView === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                PLANTILLA
              </button>
            )}
            {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('visual')) && (
              <button 
                onClick={() => setCurrentView('visual')} 
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${currentView === 'visual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                VISUAL
              </button>
            )}
            {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('summary')) && (
              <button 
                onClick={() => setCurrentView('summary')} 
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${currentView === 'summary' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                RESUMEN
              </button>
            )}
            {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('personal')) && (
              <button 
                onClick={() => setCurrentView('personal')} 
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${currentView === 'personal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                PERSONAL
              </button>
            )}
            {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('annotations')) && (
              <button 
                onClick={() => setCurrentView('annotations')} 
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${currentView === 'annotations' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                ANOTACIONES
              </button>
            )}
          </div>

          {/* Right (Desktop Only): Toolbar controls */}
          <div className="hidden lg:flex items-center gap-4 xl:gap-6">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <Calendar className="text-slate-400" size={16} />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (new Date(e.target.value) > new Date(endDate)) {
                    setEndDate(e.target.value);
                  }
                }}
                className="text-xs bg-transparent font-medium text-slate-700 outline-none w-[110px]"
                title="Inicio Planificación"
              />
              <span className="text-slate-300">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="text-xs bg-transparent font-medium text-slate-700 outline-none w-[110px]"
                title="Fin Planificación"
              />
            </div>

            {currentView === 'grid' && (
              <>
                <div className="h-8 w-px bg-slate-200 border-r"></div>
                <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1.5 px-3 border border-slate-200">
                  <ZoomOut size={16} className="text-slate-400" />
                  <input 
                    type="range" 
                    min="20" 
                    max="200" 
                    step="5"
                    value={gridZoom}
                    onChange={(e) => setGridZoom(Number(e.target.value))}
                    className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    title="Ajustar Zoom de Planilla"
                  />
                  <ZoomIn size={16} className="text-slate-400" />
                  <div className="text-xs font-bold text-slate-600 w-10 text-right select-none">{gridZoom}%</div>
                </div>
                <div className="h-8 w-px bg-slate-200 border-r"></div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200 shadow-sm">
                  <button
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className="p-1.5 hover:bg-white hover:text-blue-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 rounded text-slate-500 transition cursor-pointer"
                    title="Deshacer (Undo)"
                  >
                    <Undo size={15} />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className="p-1.5 hover:bg-white hover:text-blue-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 rounded text-slate-500 transition cursor-pointer"
                    title="Rehacer (Redo)"
                  >
                    <Redo size={15} />
                  </button>
                </div>
              </>
            )}

            <div className="h-8 w-px bg-slate-200 border-r"></div>

            {canEdit && (
              <button
                onClick={() => setNewCategoryModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm"
              >
                <Plus size={16} />
                Nueva Categoría
              </button>
            )}

            <div className="h-8 w-px bg-slate-200 border-r"></div>

            {currentUser && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold select-none border border-slate-200 bg-slate-50/50">
                  {syncStatus === 'loading' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      <span className="text-blue-600 font-medium">Sincronizando...</span>
                    </>
                  )}
                  {syncStatus === 'saving' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce"></span>
                      <span className="text-amber-600 font-medium">Guardando...</span>
                    </>
                  )}
                  {syncStatus === 'saved' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span className="text-emerald-600 font-medium">Nube al día</span>
                    </>
                  )}
                  {syncStatus === 'error' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      <span className="text-red-600 font-medium">Error de Red</span>
                    </>
                  )}
                  {syncStatus === 'idle' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                      <span className="text-slate-500 font-medium">Conectado</span>
                    </>
                  )}
                </div>

                <span className="text-sm font-semibold text-slate-700 max-w-[120px] truncate" title={currentUser.email}>
                   {currentUser.email.split('@')[0]}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => setSettingsModalOpen(true)}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-3 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm"
                    title="Ajustes de Administrador"
                  >
                    <Settings size={16} />
                  </button>
                )}
                <button
                  onClick={() => { setCurrentUser(null); setSettingsModalOpen(false); }}
                  className="text-slate-400 hover:text-red-500 p-2 rounded-lg transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Button (Mobile Only) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors focus:outline-none"
            aria-label="Menú de navegación"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Dropdown Menu (Mobile Only) */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 border-t border-slate-100 pt-4 pb-2 flex flex-col gap-4">
            {/* 1. View Switcher */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vistas</span>
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-full">
                {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('grid')) && (
                  <button 
                    onClick={() => { setCurrentView('grid'); setMobileMenuOpen(false); }} 
                    className={`flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-colors ${currentView === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    PLANTILLA
                  </button>
                )}
                {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('visual')) && (
                  <button 
                    onClick={() => { setCurrentView('visual'); setMobileMenuOpen(false); }} 
                    className={`flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-colors ${currentView === 'visual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    VISUAL
                  </button>
                )}
                {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('summary')) && (
                  <button 
                    onClick={() => { setCurrentView('summary'); setMobileMenuOpen(false); }} 
                    className={`flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-colors ${currentView === 'summary' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    RESUMEN
                  </button>
                )}
                {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('personal')) && (
                  <button 
                    onClick={() => { setCurrentView('personal'); setMobileMenuOpen(false); }} 
                    className={`flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-colors ${currentView === 'personal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    PERSONAL
                  </button>
                )}
                {(!currentUser || currentUser.role === 'admin' || currentUser.permissions.allowedViews.includes('annotations')) && (
                  <button 
                    onClick={() => { setCurrentView('annotations'); setMobileMenuOpen(false); }} 
                    className={`flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-colors ${currentView === 'annotations' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    ANOTACIONES
                  </button>
                )}
              </div>
            </div>

            {/* 2. Calendar Inputs */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Planificación</span>
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                <div className="flex flex-col">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase mb-1">Inicio</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (new Date(e.target.value) > new Date(endDate)) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1.5 outline-none focus:border-blue-500 w-full"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase mb-1">Fin</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1.5 outline-none focus:border-blue-500 w-full"
                  />
                </div>
              </div>
            </div>

            {/* 3. Zoom (Grid view only) & Table Options */}
            {currentView === 'grid' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zoom Planilla</span>
                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200/60 px-3">
                    <ZoomOut size={15} className="text-slate-400 shrink-0" />
                    <input 
                      type="range" 
                      min="20" 
                      max="200" 
                      step="5"
                      value={gridZoom}
                      onChange={(e) => setGridZoom(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <ZoomIn size={15} className="text-slate-400 shrink-0" />
                    <div className="text-xs font-bold text-slate-600 w-10 text-right select-none shrink-0">{gridZoom}%</div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Historial</span>
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => { handleUndo(); setMobileMenuOpen(false); }}
                      disabled={historyIndex <= 0}
                      className="flex-1 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-200 font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                    >
                      <Undo size={14} />
                      Deshacer
                    </button>
                    <button
                      onClick={() => { handleRedo(); setMobileMenuOpen(false); }}
                      disabled={historyIndex >= history.length - 1}
                      className="flex-1 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-200 font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                    >
                      <Redo size={14} />
                      Rehacer
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opciones de Tabla</span>
                  <label className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 px-3 cursor-pointer select-none">
                    <span className="text-xs font-semibold text-slate-700">Ocultar Nombres</span>
                    <input 
                      type="checkbox"
                      checked={hideEmployeeColumnMobile}
                      onChange={(e) => setHideEmployeeColumnMobile(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>
                </div>
              </>
            )}

            {/* 4. Actions & User Profile */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              {canEdit && (
                <button
                  onClick={() => { setNewCategoryModalOpen(true); setMobileMenuOpen(false); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <Plus size={14} />
                  Nueva Categoría
                </button>
              )}

              {currentUser && (
                <div className="flex flex-col gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 mt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-xs font-bold text-slate-700 truncate max-w-[150px]">{currentUser.email.split('@')[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border border-slate-200 bg-white">
                      {syncStatus === 'loading' && <span className="text-blue-600">Cargando...</span>}
                      {syncStatus === 'saving' && <span className="text-amber-600">Guardando...</span>}
                      {syncStatus === 'saved' && <span className="text-emerald-600">Guardado</span>}
                      {syncStatus === 'error' && <span className="text-red-600">Error Red</span>}
                      {syncStatus === 'idle' && <span className="text-slate-500">Conectado</span>}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-1">
                    {isAdmin && (
                      <button
                        onClick={() => { setSettingsModalOpen(true); setMobileMenuOpen(false); }}
                        className="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm"
                      >
                        <Settings size={13} />
                        Ajustes
                      </button>
                    )}
                    <button
                      onClick={() => { setCurrentUser(null); setSettingsModalOpen(false); setMobileMenuOpen(false); }}
                      className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <LogOut size={13} />
                      Cerrar Sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {currentView === 'visual' ? (
        <div className="flex-1 overflow-auto bg-slate-50 p-6 custom-scrollbar relative flex flex-col">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-3 rounded-lg shadow-sm border border-slate-200 gap-3 shrink-0">
            <div className="relative">
              <h2 
                className="text-lg font-bold text-slate-800 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors select-none flex items-center gap-2"
                onClick={() => setDaySelectPopoverOpen(!daySelectPopoverOpen)}
              >
                {formatDateDay(daysArray[selectedDayIdx])}
                <ChevronDown size={20} className={`transform transition-transform ${daySelectPopoverOpen ? 'rotate-180' : ''}`} />
              </h2>
              {daySelectPopoverOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setDaySelectPopoverOpen(false)}
                  ></div>
                  <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-slate-200 z-50 w-56 max-h-64 overflow-y-auto py-1 custom-scrollbar">
                    {daysArray.map((d, idx) => (
                      <button
                        key={idx}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${idx === selectedDayIdx ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 font-medium'}`}
                        onClick={() => {
                          setSelectedDayIdx(idx);
                          setDaySelectPopoverOpen(false);
                        }}
                      >
                       {formatDateDay(d)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center bg-slate-100 rounded-md p-1 border border-slate-200 w-full sm:w-auto justify-center">
                <button 
                  onClick={() => setVisualZoom(prev => Math.max(100, prev - 25))}
                  className="p-1 hover:bg-white hover:text-blue-600 rounded text-slate-500 transition shadow-sm bg-slate-50 border border-slate-200/50"
                  title="Reducir"
                >
                  <ZoomOut size={16} />
                </button>
                <div className="px-2 text-xs font-bold text-slate-600 w-16 text-center select-none" title="Zoom de tabla">{visualZoom}%</div>
                <button 
                  onClick={() => setVisualZoom(prev => Math.min(400, prev + 25))}
                  className="p-1 hover:bg-white hover:text-blue-600 rounded text-slate-500 transition shadow-sm bg-slate-50 border border-slate-200/50"
                  title="Ampliar"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={() => setSelectedDayIdx(prev => Math.max(0, prev - 1))}
                  disabled={selectedDayIdx === 0}
                  className="flex-1 sm:flex-initial px-4 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md font-semibold text-slate-700 transition text-xs md:text-sm text-center"
                >
                  Día Anterior
                </button>
                <button 
                  onClick={() => setSelectedDayIdx(prev => Math.min(daysArray.length - 1, prev + 1))}
                  disabled={selectedDayIdx === daysArray.length - 1}
                  className="flex-1 sm:flex-initial px-4 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 rounded-md font-semibold transition text-xs md:text-sm text-center"
                >
                  Siguiente Día
                </button>
              </div>
            </div>
          </div>
          
          <div ref={visualContainerRef} className="flex-1 overflow-auto bg-white border border-slate-300 shadow-sm custom-scrollbar relative min-h-0">
            <table className="border-collapse text-[11px] table-fixed" style={{ width: `${visualZoom}%`, minWidth: '100%' }}>
              <thead className="sticky top-0 z-20 bg-white shadow-sm">
                <tr>
                  <th className={`${headerCell} bg-slate-200 w-6 border-r-0 sticky left-0 z-30 shadow-[1px_0_0_#cbd5e1]`}></th>
                  <th 
                    className={`${headerCell} bg-slate-200 text-left px-1 sticky left-[24px] z-30 shadow-[2px_0_4px_-2px_#cbd5e1]`}
                    style={{ width: nameColumnWidth, minWidth: nameColumnWidth }}
                  >
                    PERSONAL
                  </th>
                  {visualHours.map(h => (
                    <th key={h} className={`${headerCell} bg-slate-100 font-bold px-0 mx-0 text-center tracking-tighter border-slate-300 text-[10px]`}>
                      {formatVisualHour(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visualGroups.map(group => {
                  if (group.employees.length === 0) return null;

                  return (
                    <React.Fragment key={group.catId}>
                      {group.employees.map((emp, rowIdx) => {
                        return (
                          <tr key={emp.id} className="h-[20px] hover:bg-slate-50">
                            {rowIdx === 0 && (
                              <td 
                                rowSpan={group.employees.length} 
                                className={`${cellBorder} border-slate-400 relative sticky left-0 z-10 w-6 p-0`}
                                style={{ backgroundColor: group.catColor + '60' }}
                              >
                                <div className="absolute inset-0 flex items-center justify-center overflow-hidden w-full">
                                  <div 
                                    className="font-bold text-[11px] text-black w-6 mx-auto tracking-widest uppercase flex items-center justify-center opacity-90 h-full p-0 m-0 whitespace-nowrap"
                                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                                  >
                                    {group.catName}
                                  </div>
                                </div>
                              </td>
                            )}
                              <td 
                                className={`${cellBorder} px-1 font-bold bg-white text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis text-[10px] sm:text-[11px] leading-tight align-middle sticky left-[24px] z-10 shadow-[2px_0_4px_-2px_#e2e8f0]`}
                                style={{ width: nameColumnWidth, minWidth: nameColumnWidth }}
                              >
                                {emp.name.toUpperCase()}
                              </td>
                              {visualHours.map(h => {
                                const overlappingShifts = emp.shifts.filter((s: any) => s.start < h + 1 && s.end > h);

                                const isFilled = overlappingShifts.length > 0;
                                const isOverlap = overlappingShifts.length > 1;
                                const bgColor = isOverlap ? '#ef4444' : (isFilled ? overlappingShifts[0].color : '#ffffff');
                                
                                return (
                                  <td 
                                    key={h} 
                                    className={`${cellBorder} text-center font-bold text-white text-[10px] ${canEdit ? 'cursor-pointer hover:opacity-80' : ''} transition-opacity`}
                                    style={{ backgroundColor: bgColor }}
                                    onClick={() => {
                                      if (!canEdit) return;
                                      if (isFilled) {
                                        toggleVisualHour(emp.catId, emp.name, h, true);
                                      } else {
                                        toggleVisualHour(emp.catId, emp.name, h, false);
                                      }
                                    }}
                                  >
                                    {isFilled ? '1' : ''}
                                  </td>
                                );
                              })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : currentView === 'summary' ? (
        <div className="flex-1 overflow-auto bg-slate-50 p-6 custom-scrollbar">
          <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Resumen de Trabajadores</h2>
                <p className="text-sm text-slate-500">Total de horas y euros acumulados por empleado en este periodo.</p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-sm text-slate-500 font-medium">Total Plantilla</div>
                <div className="text-xl md:text-2xl font-black text-emerald-600">{totalCostFromStats > 0 ? `${totalCostFromStats.toFixed(2)} €` : '0.00 €'}</div>
              </div>
            </div>
            {employeeStats.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No hay trabajadores registrados con datos.
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr>
                    <th className="px-6 py-3 border-b text-sm font-semibold text-slate-600 bg-slate-50 uppercase tracking-widest">Trabajador</th>
                    <th className="px-6 py-3 border-b text-sm font-semibold text-slate-600 bg-slate-50 uppercase tracking-widest text-right">Horas Totales</th>
                    <th className="px-6 py-3 border-b text-sm font-semibold text-slate-600 bg-slate-50 uppercase tracking-widest text-right">Total a Cobrar</th>
                    <th className="px-6 py-3 border-b text-sm font-semibold text-slate-600 bg-slate-50 uppercase tracking-widest text-center">Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeStats.map((emp, idx) => (
                    <tr 
                      key={idx} 
                      className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-0 cursor-pointer"
                      onClick={() => setSelectedEmployeeNameForModal(emp.name)}
                    >
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{emp.name}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-600 text-right">
                        {formatDecimalHours(emp.hours)}h
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600 text-right">
                        {emp.totalEuros.toFixed(2)} €
                      </td>
                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={emp.allPaid}
                          onChange={(e) => toggleEmployeePaidStatus(emp.name, e.target.checked)}
                          className="w-5 h-5 cursor-pointer accent-green-600 outline-none"
                          disabled={!canEdit}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>
      ) : currentView === 'personal' ? (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50">
          {/* Left Panel: Employee List (hidden on mobile) */}
          <div className="hidden md:flex w-full md:w-80 border-r border-slate-200 bg-white flex-col h-full shrink-0">
            {/* Search Box */}
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar empleado..."
                  value={searchQueryPersonalView}
                  onChange={(e) => setSearchQueryPersonalView(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50/50"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {personalViewEmployees
                .filter(emp => emp.name.toLowerCase().includes(searchQueryPersonalView.toLowerCase()))
                .map((emp) => {
                  const isSelected = selectedEmployeePersonalView 
                    ? selectedEmployeePersonalView.toLowerCase() === emp.name.toLowerCase()
                    : false;
                  return (
                    <button
                      key={emp.name}
                      onClick={() => {
                        setSelectedEmployeePersonalView(emp.name);
                        setCopiedAllSuccess(false);
                      }}
                      className={`w-full text-left px-3.5 py-3 rounded-lg transition-all flex items-center justify-between group cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' 
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {emp.name}
                        </div>
                        <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                          {emp.shifts.length} {emp.shifts.length === 1 ? 'turno' : 'turnos'} • {formatDecimalHours(emp.totalHours)}h
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-0.5 rounded-full font-medium tracking-tight ${
                        isSelected 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}>
                        {emp.hasMultipleCategories ? 'Multicat' : emp.categories[0] || 'Sin cat'}
                      </div>
                    </button>
                  );
                })}
              {personalViewEmployees.filter(emp => emp.name.toLowerCase().includes(searchQueryPersonalView.toLowerCase())).length === 0 && (
                <div className="p-8 text-center text-sm text-slate-400 italic">
                  No se encontraron empleados.
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Selected Employee Details */}
          <div className="flex-1 flex flex-col overflow-hidden h-full bg-slate-50">
            {(() => {
              const filteredList = personalViewEmployees.filter(emp => emp.name.toLowerCase().includes(searchQueryPersonalView.toLowerCase()));
              const selectedEmp = filteredList.find(
                e => e.name.toLowerCase() === (selectedEmployeePersonalView || '').toLowerCase()
              ) || (filteredList.length > 0 ? filteredList[0] : null);

              const currentEmp = selectedEmp;

              if (!currentEmp) {
                return (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-300">
                      <LayoutGrid size={28} />
                    </div>
                    <p className="text-sm font-medium">Selecciona un empleado para ver su horario</p>
                  </div>
                );
              }

              // Let's format the short weekday in Spanish
              const getShortDayOfWeek = (d: Date) => {
                const days = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
                return days[d.getDay()];
              };

              const formatShortDate = (d: Date) => {
                return `${getShortDayOfWeek(d)} ${d.getDate()}/${d.getMonth() + 1}`;
              };

              // Build the text block of all shifts for copying
              const buildAllShiftsText = () => {
                return currentEmp.shifts.map(shift => {
                  const catPart = currentEmp.hasMultipleCategories ? ` ${shift.catName.toUpperCase()}` : '';
                  return `${currentEmp.name.toUpperCase()}${catPart} ${formatShortDate(shift.day)} ${shift.start} - ${shift.end}`;
                }).join('\n');
              };

              const handleCopyAll = () => {
                navigator.clipboard.writeText(buildAllShiftsText());
                setCopiedAllSuccess(true);
                setTimeout(() => setCopiedAllSuccess(false), 2000);
              };

              const handleCopySingle = (shiftText: string, shiftId: string) => {
                navigator.clipboard.writeText(shiftText);
                setCopiedPersonalViewShiftId(shiftId);
                setTimeout(() => setCopiedPersonalViewShiftId(null), 2000);
              };

              const handlePersonalScroll = (e: React.UIEvent<HTMLDivElement>) => {
                const scrollTop = e.currentTarget.scrollTop;
                if (scrollTop > 20) {
                  setIsPersonalHeaderShrunk(true);
                } else {
                  setIsPersonalHeaderShrunk(false);
                }
              };

              return (
                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {/* Desktop Detail Header */}
                  <div className="hidden md:flex bg-white p-6 border-b border-slate-200 shrink-0 justify-between items-center gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                          {currentEmp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h2 className="text-lg font-black text-slate-800 tracking-tight uppercase">{currentEmp.name}</h2>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 font-medium">
                            <span>{currentEmp.shifts.length} {currentEmp.shifts.length === 1 ? 'turno' : 'turnos'}</span>
                            <span>•</span>
                            <span>{formatDecimalHours(currentEmp.totalHours)}h totales</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {currentEmp.shifts.length > 0 && (
                      <button
                        onClick={handleCopyAll}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                          copiedAllSuccess 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                            : 'bg-blue-600 hover:bg-blue-700 border-blue-600 hover:border-blue-700 text-white shadow-sm shadow-blue-500/10'
                        }`}
                      >
                        {copiedAllSuccess ? (
                          <>
                            <Check size={13} />
                            <span>¡COPIADO!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>COPIAR TODO EL HORARIO</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Mobile Sticky Header (Sticky top select dropdown) */}
                  <div 
                    className={`md:hidden sticky top-0 z-20 bg-white border-b border-slate-200 shrink-0 transition-all duration-300 shadow-sm ${
                      isPersonalHeaderShrunk ? 'p-2.5 gap-2' : 'p-4 gap-3'
                    } flex flex-col`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <label className={`block text-[9px] font-bold text-slate-400 uppercase tracking-widest ${isPersonalHeaderShrunk ? 'hidden' : 'mb-1'}`}>
                          Seleccionar Empleado
                        </label>
                        <div className="relative">
                          <select
                            value={currentEmp.name}
                            onChange={(e) => {
                              setSelectedEmployeePersonalView(e.target.value);
                              setCopiedAllSuccess(false);
                            }}
                            className="w-full pl-3 pr-8 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 uppercase appearance-none cursor-pointer"
                          >
                            {personalViewEmployees.map(emp => (
                              <option key={emp.name} value={emp.name}>
                                {emp.name} ({emp.shifts.length} T)
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-extrabold text-slate-800">
                          {formatDecimalHours(currentEmp.totalHours)}h
                        </div>
                        <div className="text-[9px] text-slate-400 font-semibold leading-none">
                          {currentEmp.shifts.length} {currentEmp.shifts.length === 1 ? 'turno' : 'turnos'}
                        </div>
                      </div>
                    </div>

                    {currentEmp.shifts.length > 0 && !isPersonalHeaderShrunk && (
                      <button
                        onClick={handleCopyAll}
                        className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                          copiedAllSuccess 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                            : 'bg-blue-600 hover:bg-blue-700 border-blue-600 hover:border-blue-700 text-white shadow-sm shadow-blue-500/10'
                        }`}
                      >
                        {copiedAllSuccess ? (
                          <>
                            <Check size={11} />
                            <span>¡HORARIO COPIADO!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>COPIAR TODO EL HORARIO</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Shifts List Content */}
                  <div 
                    onScroll={handlePersonalScroll}
                    className="flex-1 overflow-y-auto overflow-x-hidden w-full custom-scrollbar p-4 md:p-6"
                  >
                    {currentEmp.shifts.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 italic">
                        No hay turnos asignados para este periodo.
                      </div>
                    ) : (
                      (() => {
                        // Group shifts by dayKey
                        const groups: Record<string, typeof currentEmp.shifts> = {};
                        currentEmp.shifts.forEach(shift => {
                          const dayKey = shift.day.toISOString().split('T')[0];
                          if (!groups[dayKey]) {
                            groups[dayKey] = [];
                          }
                          groups[dayKey].push(shift);
                        });
                        
                        const shiftsByDay = Object.keys(groups)
                          .sort()
                          .map(dayKey => ({
                            dayKey,
                            day: new Date(dayKey),
                            shifts: groups[dayKey].sort((a, b) => a.start.localeCompare(b.start))
                          }));

                        return (
                          <div className="max-w-4xl space-y-6">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Horarios Disponibles por Día</h3>
                            {shiftsByDay.map(({ dayKey, day, shifts }) => {
                              return (
                                <div key={dayKey} className="flex flex-col md:flex-row md:items-start border-b border-slate-200/60 pb-5 last:border-0 last:pb-0 gap-4">
                                  {/* Day label on the left (row-like header) */}
                                  <div className="w-full md:w-36 shrink-0 pt-1.5">
                                    <span className="text-sm font-black text-slate-700 capitalize tracking-tight bg-slate-200/60 px-2.5 py-1 rounded-md block md:inline-block">
                                      {formatDateDay(day)}
                                    </span>
                                  </div>

                                  {/* Shifts side-by-side on the right (columns) */}
                                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {shifts.map((shift) => {
                                      const catPart = currentEmp.hasMultipleCategories ? ` ${shift.catName.toUpperCase()}` : '';
                                      const shiftText = `${currentEmp.name.toUpperCase()}${catPart} ${formatShortDate(shift.day)} ${shift.start} - ${shift.end}`;
                                      const isCopied = copiedPersonalViewShiftId === shift.id;

                                      return (
                                        <div 
                                          key={shift.id}
                                          className="rounded-xl border p-3.5 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 group relative overflow-hidden bg-white"
                                          style={{ 
                                            backgroundColor: shift.catColor + '15',
                                            borderColor: shift.catColor + '60',
                                            borderLeft: `4px solid ${shift.catColor}`
                                          }}
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="font-mono text-[11px] sm:text-xs font-bold text-slate-800 select-all tracking-tight leading-normal uppercase break-words whitespace-normal">
                                              {shiftText}
                                            </div>
                                            <div className="mt-2 flex items-center gap-1.5">
                                              <span className="text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider bg-white/80 shadow-sm border border-slate-100" style={{ color: shift.catColor }}>
                                                {shift.catName}
                                              </span>
                                              <span className="text-[10px] text-slate-500 font-medium">
                                                Duración: {formatDecimalHours(getHours(shift.start, shift.end))}h
                                              </span>
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => handleCopySingle(shiftText, shift.id)}
                                            className={`p-1.5 rounded-lg border transition-all shrink-0 cursor-pointer ${
                                              isCopied 
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-600 animate-pulse' 
                                                : 'bg-white/80 hover:bg-white border-slate-200 text-slate-500 hover:text-slate-700 shadow-sm'
                                            }`}
                                            title="Copiar este turno"
                                          >
                                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : currentView === 'annotations' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6">
          <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <FileText size={20} className="text-blue-500" />
                Anotaciones de Personal
              </h2>
              <p className="text-xs text-slate-500 mt-1">Escribe anotaciones para cada empleado. Serán visibles al pasar el ratón sobre su nombre en la plantilla.</p>
            </div>
            <div className="p-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/50 text-slate-600 text-[11px] uppercase tracking-wider font-bold">
                    <th className="px-6 py-3 border-b border-slate-200 w-1/3">Empleado</th>
                    <th className="px-6 py-3 border-b border-slate-200 w-2/3">Anotaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(new Set(flatRows.filter(r => r.type === 'employee' && r.name.trim() !== '').map(r => r.name))).map((empName: string) => (
                    <tr key={empName} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-sm text-slate-800 align-top uppercase break-words border-r border-slate-100">
                        {empName}
                      </td>
                      <td className="px-6 py-3">
                        <AutoResizingTextarea
                          value={annotations[empName] || ''}
                          onChange={(e) => setAnnotations(prev => ({ ...prev, [empName]: e.target.value }))}
                          className="w-full text-sm p-3 border border-slate-200 rounded-lg focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all outline-none resize-none min-h-[60px] bg-white shadow-sm"
                          placeholder="Escribe una anotación para este empleado..."
                          disabled={!canEdit}
                        />
                      </td>
                    </tr>
                  ))}
                  {flatRows.filter(r => r.type === 'employee' && r.name.trim() !== '').length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-6 py-12 text-center text-slate-400 italic text-sm">No hay empleados registrados en la plantilla.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div ref={gridContainerRef} className="flex-1 overflow-auto bg-[#c5d9f1] p-3 shadow-inner custom-scrollbar relative">
            <div 
              className="bg-white min-w-max shadow text-slate-800 relative z-0 inline-block"
              style={{ zoom: gridZoom / 100 }}
            >
            <table className="w-auto border-collapse table-fixed text-[11px] select-text">
              
              {/* HEADERS TOP ROW */}
            <thead className="sticky top-0 z-40">
              <tr>
                <th colSpan={2} className={`${headerCell} bg-[#f4b084] text-black w-12 uppercase tracking-wider`}>
                  Categoría
                </th>
                {!(hideEmployeeColumnMobile && isMobile) && (
                  <th 
                    className={`${headerCell} bg-[#f4b084] text-black uppercase tracking-wider sticky left-0 z-40 shadow-[2px_0_4px_-2px_#cbd5e1]`}
                    style={{ width: nameColumnWidth, minWidth: nameColumnWidth }}
                  >
                    Empleados
                  </th>
                )}
                <th className={`${headerCell} bg-[#f4b084] w-12`} title="Precio € por hora">
                  €/h
                </th>
                {daysArray.map((day, i) => (
                  <th key={i} colSpan={3} className={`${headerCell} bg-[#f4b084] w-24 uppercase`}>
                    {formatDateDay(day)}
                  </th>
                ))}
                <th colSpan={3} className={`${headerCell} bg-[#f4b084] w-52`}>
                  Totales
                </th>
              </tr>

              {/* HEADERS SUB ROW */}
              <tr>
                <th className={`${headerCell} w-6 bg-slate-200 border-r-0`}></th>
                <th className={`${headerCell} w-6 bg-slate-200 border-l-0 text-slate-400`}></th>
                {!(hideEmployeeColumnMobile && isMobile) && (
                  <th 
                    className={`${headerCell} bg-slate-200 sticky left-0 z-40 shadow-[2px_0_4px_-2px_#cbd5e1]`}
                    style={{ width: nameColumnWidth, minWidth: nameColumnWidth }}
                  >
                    Nombre
                  </th>
                )}
                <th className={`${headerCell} bg-slate-200 w-12`}>Tarifa</th>
                
                {daysArray.map((_, i) => (
                  <React.Fragment key={i}>
                    <th className={`${headerCell} bg-slate-100 font-normal border-r border-slate-300 w-8 tracking-tighter`} title="Hora Entrada">h. en.</th>
                    <th className={`${headerCell} bg-slate-100 font-normal border-r border-slate-300 w-8 tracking-tighter`} title="Hora Salida">h. sa.</th>
                    <th className={`${headerCell} bg-slate-200 text-slate-600 font-semibold w-8`} title="Total Horas Día">t.h</th>
                  </React.Fragment>
                ))}

                <th className={`${headerCell} bg-slate-200 w-14`}>t. Horas</th>
                <th className={`${headerCell} bg-slate-200 w-16`}>Total €</th>
                <th className={`${headerCell} bg-slate-200 w-20`}>Estado</th>
              </tr>
            </thead>

            {/* BODY ROWS */}
            <tbody>
              {categories.map((cat, catIdx) => {
                const isAnyRowSelectedInCat = cat.rows.some(r => r.id === selectedRowId);
                const totalRowSpan = cat.rows.length + 1 + (isAnyRowSelectedInCat && canEdit ? 1 : 0); // + 1 for Action Row + 1 if insertion row is visible
                
                return (
                  <React.Fragment key={cat.id}>
                    {cat.rows.map((row, rowIdx) => {
                      // Computations for row totals
                      let rowHoursDecimals = 0;
                      if (row.type === 'employee') {
                         for (let d = 0; d < daysArray.length; d++) {
                           const s = row.shifts[d];
                           if (s) {
                              const hrs = getHours(s.start, s.end);
                              rowHoursDecimals += hrs;
                              dailyCosts[d] += hrs * row.rate; // accumulate into global day total
                           }
                         }
                      }
                      const rowTotalEuros = rowHoursDecimals * row.rate;
                      globalCost += rowTotalEuros;

                      const isDragOver = dragOverInfo?.catId === cat.id && dragOverInfo?.rowIdx === rowIdx;
                      const globalRowIdx = flatRows.findIndex(fr => fr.rowId === row.id);
                      const isFirstRow = rowIdx === 0;
                      const topBorderClass = isFirstRow ? " border-t-2 border-t-slate-600" : "";

                      return (
                        <React.Fragment key={row.id}>
                          <tr 
                            className={`relative group h-[20px] ${isDragOver ? 'bg-blue-100' : selectedRowId === row.id ? 'bg-yellow-100/70' : 'hover:bg-blue-50/40'}`}
                            onClick={() => setSelectedRowId(prev => prev === row.id ? null : row.id)}
                            onFocus={() => setSelectedRowId(row.id)}
                            draggable={canEdit}
                            onDragStart={(e) => canEdit && handleDragStart(e, cat.id, rowIdx)}
                            onDragOver={(e) => canEdit && handleDragOver(e, cat.id, rowIdx)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => canEdit && handleDrop(e, cat.id, rowIdx)}
                            onDragEnd={handleDragEnd}
                          >
                            {/* 1. Category Vertical Label (Only on 1st row of category) */}
                            {rowIdx === 0 && (
                              <td 
                                rowSpan={totalRowSpan} 
                                className={`${cellBorder} bg-opacity-70 group relative align-middle border-t-2 border-t-slate-600 border-b-2 border-b-slate-600 border-l-2 border-l-slate-600`}
                                style={{ backgroundColor: cat.color }}
                              >
                                <div 
                                  onClick={(e) => {
                                    if (!canEdit) return;
                                    e.stopPropagation();
                                    setActiveColorPickerCatId(cat.id);
                                  }}
                                  className="absolute inset-0 flex items-center justify-center overflow-hidden w-full cursor-pointer hover:bg-black/5 active:bg-black/10 transition-colors"
                                  title="Cambiar Color de Categoría"
                                >
                                  <div 
                                    className="font-bold text-[13px] text-black w-6 mx-auto tracking-widest uppercase flex items-center justify-center py-0 opacity-90 h-full whitespace-nowrap"
                                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                                  >
                                    {cat.name}
                                  </div>
                                </div>
                                {canEdit && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                                    className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 p-1 text-red-600 bg-white/80 rounded hover:bg-red-100 transition-all z-10 shadow cursor-pointer"
                                    title="Eliminar Categoría"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}

                                {/* Color Picker Popover */}
                                {activeColorPickerCatId === cat.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-50 cursor-default"
                                      onClick={(e) => { e.stopPropagation(); setActiveColorPickerCatId(null); }}
                                    ></div>
                                    <div 
                                      className="absolute top-1/2 left-full ml-2 -translate-y-1/2 bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-50 flex flex-col gap-2.5 min-w-[140px] cursor-default text-left select-none text-slate-700 font-sans"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Color de Categoría</div>
                                      <div className="grid grid-cols-4 gap-1.5">
                                        {PALETTE.map((c) => (
                                          <button
                                            key={c}
                                            onClick={() => {
                                              updateCategoryColor(cat.id, c);
                                              setActiveColorPickerCatId(null);
                                            }}
                                            className="w-5 h-5 rounded-full border border-black/10 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                                            style={{ backgroundColor: c }}
                                          />
                                        ))}
                                      </div>
                                      <div className="h-px bg-slate-100 my-1"></div>
                                      <label className="flex items-center justify-between gap-2 text-[10px] font-medium text-slate-600 cursor-pointer">
                                        <span>Personalizado:</span>
                                        <input 
                                          type="color" 
                                          value={cat.color}
                                          onChange={(e) => updateCategoryColor(cat.id, e.target.value)}
                                          className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                                        />
                                      </label>
                                    </div>
                                  </>
                                )}
                              </td>
                            )}

                            {/* 2. Divider Blank space */}
                            <td className={`${cellBorder} w-6${topBorderClass}`} style={{ backgroundColor: cat.color + '40' }}></td>

                            {/* 3. Employee Name / Subheader */}
                            {!(hideEmployeeColumnMobile && isMobile) && (
                              <td 
                                className={`${cellBorder} relative font-semibold text-slate-800 group/name sticky left-0 z-30 hover:z-[60] shadow-[2px_0_4px_-2px_#cbd5e1] ${selectedRowId === row.id ? 'bg-yellow-100' : ''}${topBorderClass}`}
                                style={{ 
                                  width: nameColumnWidth, 
                                  minWidth: nameColumnWidth,
                                  backgroundColor: selectedRowId === row.id ? undefined : (row.type === 'subheader' ? '#dcf3db' : cat.color + '25')
                                }}
                              >
                                {row.type === 'employee' && annotations[row.name] && (
                                  <div className="absolute top-0 left-full ml-2 opacity-0 group-hover/name:opacity-100 bg-slate-800 text-white text-[12px] font-medium p-3.5 rounded-lg shadow-2xl z-50 pointer-events-auto transition-all duration-200 invisible group-hover/name:visible border border-slate-600 leading-relaxed min-w-[200px] w-[200px] aspect-[4/5] overflow-y-auto custom-scrollbar flex flex-col">
                                    <div className="break-words whitespace-pre-wrap flex-1">{annotations[row.name]}</div>
                                  </div>
                                )}
                                <AutoResizingTextarea 
                                  value={row.name}
                                  onChange={(e) => updateRow(cat.id, row.id, r => ({...r, name: e.target.value}))}
                                  className={`${plainInput} text-left font-semibold uppercase px-2 py-0.5`}
                                  placeholder={row.type === 'employee' ? 'Nombre...' : 'TITULO SECCIÓN'}
                                  disabled={!canEdit}
                                  data-row-idx={globalRowIdx}
                                  data-col-idx={0}
                                  onKeyDown={(e: any) => handleKeyDown(e, globalRowIdx, 0)}
                                />
                                {/* Hidden Delete Button */}
                                {canEdit && (
                                  <button 
                                     onClick={() => deleteRow(cat.id, row.id)}
                                     className="absolute -left-3 top-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 bg-white shadow rounded-full p-0.5 z-40 transition-opacity"
                                  >
                                     <Trash2 size={10} />
                                  </button>
                                )}
                              </td>
                            )}

                            {/* 4. Rate */}
                            {row.type === 'subheader' ? (
                              <td 
                                className={`${cellBorder}${topBorderClass}`}
                                style={{ backgroundColor: selectedRowId === row.id ? undefined : '#dcf3db' }}
                              ></td>
                            ) : (
                              <td 
                                className={`${cellBorder} text-slate-500 ${selectedRowId === row.id ? 'bg-yellow-100' : ''}${topBorderClass}`}
                                style={{ backgroundColor: selectedRowId === row.id ? undefined : cat.color + '25' }}
                              >
                                <input 
                                  type="number" 
                                  value={row.rate || ''}
                                  onChange={(e) => updateRow(cat.id, row.id, r => ({...r, rate: parseFloat(e.target.value) || 0}))}
                                  className={plainInput}
                                  min="0" step="0.5"
                                  placeholder="0"
                                  disabled={!canEdit}
                                  data-row-idx={globalRowIdx}
                                  data-col-idx={1}
                                  onKeyDown={(e) => handleKeyDown(e, globalRowIdx, 1)}
                                />
                              </td>
                            )}

                            {/* 5. Shifts or Empty for subheader */}
                            {row.type === 'subheader' ? (
                              <td 
                                colSpan={daysArray.length * 3 + 3} 
                                className={`${cellBorder}${topBorderClass} border-r-2 border-r-slate-600`}
                                style={{ backgroundColor: selectedRowId === row.id ? undefined : '#dcf3db' }}
                              ></td>
                            ) : (
                              <>
                                {daysArray.map((_, dayIdx) => {
                                  const s = row.shifts[dayIdx] || { start: '', end: '' };
                                  const dayHrs = getHours(s.start, s.end);
                                  
                                  return (
                                    <React.Fragment key={dayIdx}>
                                      <td 
                                        className={`${cellBorder} ${selectedRowId === row.id ? 'bg-yellow-100' : ''}${topBorderClass}`}
                                        style={{ backgroundColor: selectedRowId === row.id ? undefined : cat.color + '10' }}
                                      >
                                        <input 
                                          type="text" 
                                          value={s.start}
                                          onChange={(e) => handleShiftChange(cat.id, row.id, dayIdx, 'start', e.target.value)}
                                          onBlur={(e) => handleShiftBlur(cat.id, row.id, dayIdx, 'start', e.target.value)}
                                          className={plainInput} 
                                          placeholder=""
                                          disabled={!canEdit}
                                          data-row-idx={globalRowIdx}
                                          data-col-idx={2 + 2 * dayIdx}
                                          onKeyDown={(e) => handleKeyDown(e, globalRowIdx, 2 + 2 * dayIdx)}
                                        />
                                      </td>
                                      <td 
                                        className={`${cellBorder} ${selectedRowId === row.id ? 'bg-yellow-100' : ''}${topBorderClass}`}
                                        style={{ backgroundColor: selectedRowId === row.id ? undefined : cat.color + '10' }}
                                      >
                                        <input 
                                          type="text" 
                                          value={s.end}
                                          onChange={(e) => handleShiftChange(cat.id, row.id, dayIdx, 'end', e.target.value)}
                                          onBlur={(e) => handleShiftBlur(cat.id, row.id, dayIdx, 'end', e.target.value)}
                                          className={plainInput} 
                                          placeholder=""
                                          disabled={!canEdit}
                                          data-row-idx={globalRowIdx}
                                          data-col-idx={2 + 2 * dayIdx + 1}
                                          onKeyDown={(e) => handleKeyDown(e, globalRowIdx, 2 + 2 * dayIdx + 1)}
                                        />
                                      </td>
                                      <td className={`${cellBorder} ${selectedRowId === row.id ? 'bg-yellow-100/75 text-yellow-900 font-bold' : 'bg-slate-200/50 text-slate-400 font-medium'} text-center align-middle select-none pointer-events-none${topBorderClass}`}>
                                        {formatDecimalHours(dayHrs)}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}

                                {/* 6. Finals (Total Hours, Total €, Status) */}
                                <td className={`${cellBorder} ${selectedRowId === row.id ? 'bg-yellow-100 font-black text-slate-900' : 'bg-slate-200 text-slate-800 font-bold'} text-center${topBorderClass}`}>
                                  {formatDecimalHours(rowHoursDecimals)}
                                </td>
                                <td className={`${cellBorder} text-center font-bold text-[12px] tabular-nums ${(rowTotalEuros > 0 && row.status === 'PAGADO') ? 'bg-green-400/90 text-white' : (rowTotalEuros > 0 ? 'bg-green-200 text-green-900' : 'bg-slate-100 text-slate-400')}${topBorderClass}`}>
                                  {rowTotalEuros > 0 ? `${rowTotalEuros.toFixed(2)} €` : ''}
                                </td>
                                <td 
                                  className={`${cellBorder} ${selectedRowId === row.id ? 'bg-yellow-100' : ''}${topBorderClass} border-r-2 border-r-slate-600`}
                                  style={{ backgroundColor: selectedRowId === row.id ? undefined : cat.color + '25' }}
                                >
                                  <select 
                                    value={row.status}
                                    onChange={(e) => updateRow(cat.id, row.id, r => ({...r, status: e.target.value}))}
                                    className={`${plainInput} bg-transparent font-medium text-[10px] uppercase appearance-none`}
                                    disabled={!canEdit}
                                    data-row-idx={globalRowIdx}
                                    data-col-idx={2 + 2 * daysArray.length}
                                    onKeyDown={(e) => handleKeyDown(e, globalRowIdx, 2 + 2 * daysArray.length)}
                                  >
                                    <option value="">--</option>
                                    <option value="PAGADO">PAGADO</option>
                                    <option value="PREPARADO">PREPARADO</option>
                                  </select>
                                </td>
                              </>
                            )}
                          </tr>

                          {/* Insertion under selected row helper bar */}
                          {selectedRowId === row.id && canEdit && (
                            <tr className="bg-blue-50/70 border border-dashed border-blue-400 h-[24px]">
                              <td className={`${cellBorder}`} style={{ backgroundColor: cat.color + '40' }}></td>
                              {!(hideEmployeeColumnMobile && isMobile) && (
                                <td colSpan={daysArray.length * 3 + 5} className={`${cellBorder} px-3 py-1 bg-blue-50/80 border-r-2 border-r-slate-600`}>
                                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                                    <span className="text-slate-500 uppercase text-[9px] tracking-wider font-bold">Insertar bajo {row.name || 'Fila sin nombre'}:</span>
                                    <button 
                                      onClick={() => addEmployee(cat.id, rowIdx + 1)}
                                      className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-blue-100 text-blue-600 border border-blue-200 rounded shadow-sm hover:shadow transition cursor-pointer"
                                    >
                                      <UserPlus size={12} />
                                      <span>Añadir Personal</span>
                                    </button>
                                    <button 
                                      onClick={() => addSubheader(cat.id, rowIdx + 1)}
                                      className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded shadow-sm hover:shadow transition cursor-pointer"
                                    >
                                      <FilePlus size={12} />
                                      <span>Añadir Sección</span>
                                    </button>
                                  </div>
                                </td>
                              )}
                              {hideEmployeeColumnMobile && isMobile && (
                                <td colSpan={daysArray.length * 3 + 4} className={`${cellBorder} px-3 py-1 bg-blue-50/80 border-r-2 border-r-slate-600`}>
                                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                                    <button 
                                      onClick={() => addEmployee(cat.id, rowIdx + 1)}
                                      className="flex items-center gap-1.5 px-2 py-1 bg-white text-blue-600 border border-blue-200 rounded shadow-sm transition text-[10px]"
                                    >
                                      <UserPlus size={11} />
                                      <span>Personal</span>
                                    </button>
                                    <button 
                                      onClick={() => addSubheader(cat.id, rowIdx + 1)}
                                      className="flex items-center gap-1.5 px-2 py-1 bg-white text-emerald-600 border border-emerald-200 rounded shadow-sm transition text-[10px]"
                                    >
                                      <FilePlus size={11} />
                                      <span>Sección</span>
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Action Row per category */}
                    <tr 
                      className={`relative group h-[20px] ${dragOverInfo?.catId === cat.id && dragOverInfo?.rowIdx === cat.rows.length ? 'bg-blue-100' : 'bg-slate-50'}`}
                      onDragOver={(e) => handleDragOver(e, cat.id, cat.rows.length)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, cat.id, cat.rows.length)}
                    >
                      {cat.rows.length === 0 && (
                        <td 
                          rowSpan={1} 
                          className={`${cellBorder} bg-opacity-70 group relative align-middle border-t-2 border-t-slate-600 border-b-2 border-b-slate-600 border-l-2 border-l-slate-600`}
                          style={{ backgroundColor: cat.color }}
                        >
                          <div 
                            onClick={(e) => {
                              if (!canEdit) return;
                              e.stopPropagation();
                              setActiveColorPickerCatId(cat.id);
                            }}
                            className="absolute inset-0 flex items-center justify-center overflow-hidden w-full cursor-pointer hover:bg-black/5 active:bg-black/10 transition-colors"
                            title="Cambiar Color de Categoría"
                          >
                            <div 
                              className="font-bold text-[13px] text-black w-6 mx-auto tracking-widest uppercase flex items-center justify-center py-0 opacity-90 h-full whitespace-nowrap"
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                            >
                              {cat.name}
                            </div>
                          </div>
                          {canEdit && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                              className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 p-1 text-red-600 bg-white/80 rounded hover:bg-red-100 transition-all z-10 shadow cursor-pointer"
                              title="Eliminar Categoría"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}

                          {/* Color Picker Popover */}
                          {activeColorPickerCatId === cat.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-50 cursor-default"
                                onClick={(e) => { e.stopPropagation(); setActiveColorPickerCatId(null); }}
                              ></div>
                              <div 
                                className="absolute top-1/2 left-full ml-2 -translate-y-1/2 bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-50 flex flex-col gap-2.5 min-w-[140px] cursor-default text-left select-none text-slate-700 font-sans"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Color de Categoría</div>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {PALETTE.map((c) => (
                                    <button
                                      key={c}
                                      onClick={() => {
                                        updateCategoryColor(cat.id, c);
                                        setActiveColorPickerCatId(null);
                                      }}
                                      className="w-5 h-5 rounded-full border border-black/10 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                                      style={{ backgroundColor: c }}
                                    />
                                  ))}
                                </div>
                                <div className="h-px bg-slate-100 my-1"></div>
                                <label className="flex items-center justify-between gap-2 text-[10px] font-medium text-slate-600 cursor-pointer">
                                  <span>Personalizado:</span>
                                  <input 
                                    type="color" 
                                    value={cat.color}
                                    onChange={(e) => updateCategoryColor(cat.id, e.target.value)}
                                    className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                                  />
                                </label>
                              </div>
                            </>
                          )}
                        </td>
                      )}

                      {cat.rows.length > 0 && (
                        <td className={`${cellBorder} w-6 border-b-2 border-b-slate-600`} style={{ backgroundColor: cat.color + '40' }}></td>
                      )}

                      {!(hideEmployeeColumnMobile && isMobile) && (
                        <td 
                          className={`${cellBorder} p-0 sticky left-0 z-30 bg-slate-50 shadow-[2px_0_4px_-2px_#cbd5e1] border-b-2 border-b-slate-600${cat.rows.length === 0 ? ' border-t-2 border-t-slate-600' : ''}`}
                          style={{ width: nameColumnWidth, minWidth: nameColumnWidth }}
                        >
                        {canEdit && (
                          <div className="flex items-center gap-2 px-1 text-blue-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => addEmployee(cat.id)} className="flex items-center hover:bg-blue-100 px-1 py-0 rounded transition text-[10px]">
                              <Plus size={10} className="mr-1"/> EMPLEADO
                            </button>
                            <span className="text-slate-300 scale-75">|</span>
                            <button onClick={() => addSubheader(cat.id)} className="flex items-center hover:bg-blue-100 px-1 py-0 rounded transition text-[10px]">
                              <Plus size={10} className="mr-1"/> SECCIÓN
                            </button>
                          </div>
                        )}
                        </td>
                      )}
                      <td className={`${cellBorder} bg-slate-50 w-12 border-b-2 border-b-slate-600${cat.rows.length === 0 ? ' border-t-2 border-t-slate-600' : ''}`}></td>
                      <td colSpan={daysArray.length * 3 + 3} className={`${cellBorder} bg-slate-50/50 border-b-2 border-b-slate-600 border-r-2 border-r-slate-600${cat.rows.length === 0 ? ' border-t-2 border-t-slate-600' : ''}`}></td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* GLOBAL TOTALS FOOTER */}
            <tfoot className="sticky bottom-0 z-50 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
               <tr>
                  {/* Spanning Left Columns */}
                  <th className={`${headerCell} bg-slate-800 w-6 border-r-0`}></th>
                  <th className={`${headerCell} bg-slate-800 w-6 border-l-0`}></th>
                  {!(hideEmployeeColumnMobile && isMobile) && (
                    <th 
                      className={`${headerCell} bg-slate-800 text-white text-right px-2 uppercase tracking-tighter sticky left-0 z-50 shadow-[2px_0_4px_-2px_#cbd5e1] text-[9px] leading-tight`}
                      style={{ width: nameColumnWidth, minWidth: nameColumnWidth }}
                    >
                      Total Carga Salarial Diaria
                    </th>
                  )}
                  <th className={`${headerCell} bg-slate-800 w-12`}></th>

                  {/* Daily Total Euros */}
                  {daysArray.map((_, i) => (
                    <th key={i} colSpan={3} className={`${headerCell} bg-slate-700 text-white text-center tracking-wider tabular-nums`}>
                       {dailyCosts[i] > 0 ? `${dailyCosts[i].toFixed(2)} €` : '-'}
                    </th>
                  ))}

                  {/* Empty gap under hours */}
                  <th className={`${headerCell} bg-slate-800`}></th>

                  {/* Global Euro Total */}
                  <th colSpan={1} className={`${headerCell} bg-emerald-500 text-slate-900 border-emerald-600 text-sm tracking-tight tabular-nums font-black`}>
                     {globalCost > 0 ? `${globalCost.toFixed(2)} €` : '0.00 €'}
                  </th>
                  <th className={`${headerCell} bg-slate-800`}></th>
               </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Mobile Floating Toggle Column Button */}
      {isMobile && currentView === 'grid' && (
        <button
          onClick={() => setHideEmployeeColumnMobile(!hideEmployeeColumnMobile)}
          className="absolute bottom-6 right-6 z-50 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-3 rounded-full shadow-lg flex items-center gap-2 border border-slate-800 transition-all active:scale-95 cursor-pointer"
        >
          <LayoutGrid size={14} />
          <span>{hideEmployeeColumnMobile ? "Mostrar Nombres" : "Ocultar Nombres"}</span>
        </button>
      )}
    </div>
      )}
      
      {/* Scrollbar styling overrides inline */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 12px; width: 12px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; border: 2px solid #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>

      {/* Employee Details Modal */}
      {selectedEmployeeNameForModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{selectedEmployeeNameForModal}</h3>
                <p className="text-sm text-slate-500">Desglose de horas trabajadas</p>
              </div>
              <button onClick={() => setSelectedEmployeeNameForModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 bg-slate-50 rounded-full hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-x-auto custom-scrollbar pr-2 mb-4">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr>
                    <th className="py-2 px-3 border-b text-xs font-semibold text-slate-500 uppercase">Día</th>
                    <th className="py-2 px-3 border-b text-xs font-semibold text-slate-500 uppercase">Categoría</th>
                    <th className="py-2 px-3 border-b text-xs font-semibold text-slate-500 uppercase text-center">Horario</th>
                    <th className="py-2 px-3 border-b text-xs font-semibold text-slate-500 uppercase text-right">Horas</th>
                    <th className="py-2 px-3 border-b text-xs font-semibold text-slate-500 uppercase text-right">Tarifa</th>
                    <th className="py-2 px-3 border-b text-xs font-semibold text-slate-500 uppercase text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeStats.find(e => e.name === selectedEmployeeNameForModal)?.shiftsData.map((shift, i) => (
                    <tr key={i} className="hover:bg-slate-50 border-b border-slate-50 last:border-0 text-sm border-b border-slate-100">
                      <td className="py-3 px-3 text-slate-800 font-medium whitespace-nowrap capitalize">{formatDateDay(shift.day)}</td>
                      <td className="py-3 px-3 text-slate-600 font-medium">{shift.catName}</td>
                      <td className="py-3 px-3 text-slate-600 text-center">{shift.start} - {shift.end}</td>
                      <td className="py-3 px-3 text-slate-800 font-medium text-right">{formatDecimalHours(shift.hours)}h</td>
                      <td className="py-3 px-3 text-slate-600 text-right">{shift.rate} €/h</td>
                      <td className="py-3 px-3 text-emerald-600 font-bold text-right">{shift.total.toFixed(2)} €</td>
                    </tr>
                  ))}
                  {employeeStats.find(e => e.name === selectedEmployeeNameForModal)?.shiftsData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 italic">No hay turnos registrados en este periodo.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 pt-4 flex justify-between items-center bg-slate-50 p-4 rounded-lg">
              <div className="text-slate-600 font-semibold">
                Total acumulado:
              </div>
              <div className="flex gap-6 text-right">
                <div>
                   <span className="text-xs text-slate-500 uppercase block leading-none mb-1">Horas</span>
                   <span className="text-lg font-bold text-slate-800">{formatDecimalHours(employeeStats.find(e => e.name === selectedEmployeeNameForModal)?.hours || 0)}h</span>
                </div>
                <div>
                   <span className="text-xs text-slate-500 uppercase block leading-none mb-1">Euros</span>
                   <span className="text-xl font-black text-emerald-600">{(employeeStats.find(e => e.name === selectedEmployeeNameForModal)?.totalEuros || 0).toFixed(2)} €</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {newCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">Nueva Categoría</h3>
              <button onClick={() => setNewCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddCategory}>
              <input 
                autoFocus
                type="text" 
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-6"
                placeholder="Ej. COCINA..."
                required
              />
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setNewCategoryModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm font-semibold text-sm"
                >
                  Añadir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal (Admin Only) */}
      {settingsModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-5 shrink-0 border-b pb-4">
              <div className="flex items-center gap-2">
                <Settings size={22} className="text-slate-800" />
                <h3 className="text-xl font-bold text-slate-800">Ajustes Generales</h3>
              </div>
              <button onClick={() => setSettingsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 hover:bg-slate-200 p-1 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex overflow-x-auto whitespace-nowrap gap-2 md:gap-4 mb-4 border-b custom-scrollbar pb-1 shrink-0">
              <button 
                onClick={() => setSettingsTab('general')}
                className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${settingsTab === 'general' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >General</button>
              <button 
                onClick={() => setSettingsTab('users')}
                className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${settingsTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >Usuarios y Permisos</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar mb-4 min-h-0 pr-2">
               {settingsTab === 'general' ? (
                 <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl max-w-md mx-auto my-6 shadow-sm">
                   <h4 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2">
                     <Lock size={16} className="text-blue-600" />
                     Cambiar Contraseña de Administrador
                   </h4>
                   <form onSubmit={handleAdminPasswordChange} className="space-y-4">
                     <div>
                       <label className="block text-xs font-semibold text-slate-600 mb-1">Nueva Contraseña</label>
                       <input 
                         type="password"
                         value={adminPasswordInput}
                         onChange={(e) => {
                           setAdminPasswordInput(e.target.value);
                           setPasswordChangeError('');
                           setPasswordChangeSuccess('');
                         }}
                         placeholder="Ingresa la nueva contraseña..."
                         className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                         required
                       />
                     </div>
                     <div>
                       <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar Nueva Contraseña</label>
                       <input 
                         type="password"
                         value={confirmAdminPasswordInput}
                         onChange={(e) => {
                           setConfirmAdminPasswordInput(e.target.value);
                           setPasswordChangeError('');
                           setPasswordChangeSuccess('');
                         }}
                         placeholder="Confirma la nueva contraseña..."
                         className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                         required
                       />
                     </div>
                     {passwordChangeError && (
                       <p className="text-red-500 text-xs font-medium">{passwordChangeError}</p>
                     )}
                     {passwordChangeSuccess && (
                       <p className="text-green-600 text-xs font-medium">{passwordChangeSuccess}</p>
                     )}
                     <button 
                       type="submit" 
                       className="w-full bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition shadow-sm cursor-pointer"
                     >
                       Guardar Contraseña
                     </button>
                   </form>
                 </div>
               ) : (
                 <div className="flex flex-col gap-6">
                    {/* Add user form */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-3 text-sm">Añadir Nuevo Usuario</h4>
                      <form onSubmit={handleAddUser} className="flex flex-col gap-3">
                        <div className="flex flex-col md:flex-row gap-3">
                          <input 
                            type="email"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            placeholder="Email del usuario..."
                            className="flex-1 px-3 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            required
                          />
                          <input 
                            type="text"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            placeholder="Contraseña..."
                            className="flex-1 px-3 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          />
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-white px-3 py-1.5 border border-slate-300 rounded cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={newUserCanEdit}
                              onChange={(e) => setNewUserCanEdit(e.target.checked)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            Puede Modificar
                          </label>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center items-start gap-3 md:gap-4 bg-white p-3 rounded border border-slate-300 flex-wrap">
                           <span className="text-sm font-semibold text-slate-700">Pestañas permitidas:</span>
                           {['grid', 'visual', 'summary', 'personal', 'annotations'].map((view) => (
                             <label key={view} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                               <input 
                                 type="checkbox"
                                 checked={newUserViews.includes(view as ViewPermission)}
                                 onChange={(e) => {
                                   if (e.target.checked) {
                                     setNewUserViews([...newUserViews, view as ViewPermission]);
                                   } else {
                                     setNewUserViews(newUserViews.filter(v => v !== view));
                                   }
                                 }}
                                 className="w-4 h-4 text-blue-600 rounded"
                               />
                               {view === 'grid' ? 'PLANTILLA' : view === 'visual' ? 'VISUAL' : view === 'summary' ? 'RESUMEN' : view === 'personal' ? 'PERSONAL' : 'ANOTACIONES'}
                             </label>
                           ))}
                        </div>
                        {newUserViews.includes('summary') && (
                          <div className="flex flex-col md:flex-row md:items-center items-start gap-2 md:gap-3 bg-white p-3 rounded border border-slate-300">
                            <span className="text-sm font-semibold text-slate-700">Ver en RESUMEN:</span>
                            <select 
                              value={newUserSummaryEmployee}
                              onChange={(e) => setNewUserSummaryEmployee(e.target.value)}
                              className="w-full md:w-auto px-2 py-1.5 border border-slate-300 rounded text-sm outline-none bg-slate-50 cursor-pointer"
                            >
                              <option value="all">Todos los empleados</option>
                              {Array.from(new Set(flatRows.filter(r => r.type === 'employee' && r.name.trim() !== '').map(r => r.name))).map((empName: any) => (
                                <option key={empName} value={empName}>{empName}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {newUserViews.includes('personal') && (
                          <div className="flex flex-col md:flex-row md:items-center items-start gap-2 md:gap-3 bg-white p-3 rounded border border-slate-300">
                            <span className="text-sm font-semibold text-slate-700">Ver en PERSONAL:</span>
                            <select 
                              value={newUserPersonalEmployee}
                              onChange={(e) => setNewUserPersonalEmployee(e.target.value)}
                              className="w-full md:w-auto px-2 py-1.5 border border-slate-300 rounded text-sm outline-none bg-slate-50 cursor-pointer"
                            >
                              <option value="all">Todos los empleados</option>
                              {Array.from(new Set(flatRows.filter(r => r.type === 'employee' && r.name.trim() !== '').map(r => r.name))).map((empName: any) => (
                                <option key={empName} value={empName}>{empName}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <button type="submit" className="self-end bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-blue-700 transition">
                           Añadir Usuario
                        </button>
                      </form>
                    </div>

                    {/* Users list */}
                    <div>
                      <h4 className="font-bold text-slate-800 mb-3 text-sm">Lista de Usuarios</h4>
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead className="bg-slate-100 border-b border-slate-200 hidden md:table-header-group">
                            <tr>
                              <th className="px-4 py-2 font-semibold text-slate-600">Email</th>
                              <th className="px-4 py-2 font-semibold text-slate-600 text-center">Permiso</th>
                              <th className="px-4 py-2 font-semibold text-slate-600">Pestañas</th>
                              <th className="px-4 py-2 font-semibold text-slate-600">Contraseña</th>
                              <th className="px-4 py-2 font-semibold text-slate-600 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {usersList.map((user) => (
                              <tr key={user.id} className="border-b border-slate-200 md:border-slate-100 last:border-0 hover:bg-slate-50 flex flex-col md:table-row p-4 md:p-0 gap-3 md:gap-0">
                                <td className="md:px-4 md:py-3 font-medium text-slate-800 flex flex-col md:table-cell">
                                  <span className="text-[10px] text-slate-400 uppercase font-bold md:hidden mb-1">Email</span>
                                  <div className="flex items-center">
                                    {user.role === 'admin' ? (
                                      <span>
                                        {user.email}
                                        <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Admin</span>
                                      </span>
                                    ) : (
                                      <button 
                                        onClick={() => openEditUser(user)} 
                                        className="text-blue-600 hover:text-blue-800 font-bold underline decoration-blue-300 decoration-dashed underline-offset-4 cursor-pointer text-left break-all"
                                        title="Click para editar"
                                      >
                                        {user.email}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="md:px-4 md:py-3 md:text-center flex justify-between items-center md:table-cell">
                                  <span className="text-[10px] text-slate-400 uppercase font-bold md:hidden">Permiso</span>
                                  {user.role === 'admin' ? (
                                    <span className="text-slate-500 font-medium">Todo</span>
                                  ) : (
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${user.permissions.canEdit ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                                      {user.permissions.canEdit ? 'EDICIÓN' : 'LECTURA'}
                                    </span>
                                  )}
                                </td>
                                <td className="md:px-4 md:py-3 text-slate-600 text-xs flex flex-col md:table-cell">
                                  <span className="text-[10px] text-slate-400 uppercase font-bold md:hidden mb-1">Pestañas</span>
                                  <div>
                                    {user.role === 'admin' ? 'Todas' : user.permissions.allowedViews.map(v => v === 'grid' ? 'PLANTILLA' : v === 'visual' ? 'VISUAL' : v === 'summary' ? 'RESUMEN' : v === 'personal' ? 'PERSONAL' : 'ANOTACIONES').join(', ')}
                                    {user.role !== 'admin' && user.permissions.allowedViews.includes('summary') && (
                                      <div className="text-[10px] text-slate-400 mt-0.5">
                                        Resumen: {user.permissions.summaryEmployee ? user.permissions.summaryEmployee : 'Todos'}
                                      </div>
                                    )}
                                    {user.role !== 'admin' && user.permissions.allowedViews.includes('personal') && (
                                      <div className="text-[10px] text-slate-400 mt-0.5">
                                        Personal: {user.permissions.personalEmployee ? user.permissions.personalEmployee : 'Todos'}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="md:px-4 md:py-3 flex justify-between items-center md:table-cell">
                                  <span className="text-[10px] text-slate-400 uppercase font-bold md:hidden">Contraseña</span>
                                  <input 
                                    type="text" 
                                    value={user.password || ''}
                                    onChange={(e) => {
                                      const newPassword = e.target.value;
                                      setUsersList(usersList.map(u => u.id === user.id ? { ...u, password: newPassword } : u));
                                      if (user.id === currentUser?.id) {
                                        setCurrentUser(prev => prev ? { ...prev, password: newPassword } : null);
                                      }
                                    }}
                                    className="px-2 py-1 border border-slate-300 rounded text-xs w-28 focus:ring-1 focus:ring-blue-500 outline-none"
                                    placeholder={user.role === 'admin' ? '637050616' : 'Sin pass'}
                                  />
                                </td>
                                <td className="md:px-4 md:py-3 text-right flex justify-end md:table-cell mt-2 md:mt-0 pt-3 border-t border-slate-100 md:border-0 md:pt-3">
                                  {user.role !== 'admin' && (
                                    <div className="flex gap-2 justify-end items-center">
                                      <button 
                                        onClick={() => openEditUser(user)}
                                        className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 md:px-2 md:py-1 rounded md:text-xs text-sm font-bold flex items-center gap-1.5 transition-colors"
                                        title="Editar usuario"
                                      >
                                        <Edit size={14} />
                                        <span>Editar</span>
                                      </button>
                                      <button 
                                        onClick={() => setUsersList(usersList.filter(u => u.id !== user.id))}
                                        className="text-red-400 hover:text-red-600 p-1.5 md:p-1 transition-colors bg-red-50 hover:bg-red-100 rounded md:bg-transparent"
                                        title="Eliminar usuario"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                 </div>
               )}
            </div>
            
            <div className="flex justify-end gap-3 shrink-0 pt-4 border-t">
              <button 
                type="button" 
                onClick={() => setSettingsModalOpen(false)}
                className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-bold text-sm bg-slate-50 border border-slate-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">Editar Usuario</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveEditUser} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                 <label className="text-sm font-semibold text-slate-700">Email</label>
                 <input 
                   type="email"
                   value={editUserEmail}
                   onChange={(e) => setEditUserEmail(e.target.value)}
                   className="px-3 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                   required
                 />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="text-sm font-semibold text-slate-700">Contraseña</label>
                 <input 
                   type="text"
                   value={editUserPassword}
                   onChange={(e) => setEditUserPassword(e.target.value)}
                   className="px-3 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                 />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 select-none">
                <input 
                  type="checkbox" 
                  checked={editUserCanEdit}
                  onChange={(e) => setEditUserCanEdit(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                Puede Modificar (Edición)
              </label>

              <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                 <span className="text-sm font-semibold text-slate-700">Pestañas permitidas:</span>
                 <div className="flex gap-4 flex-wrap">
                   {['grid', 'visual', 'summary', 'personal', 'annotations'].map((view) => (
                     <label key={view} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                       <input 
                         type="checkbox"
                         checked={editUserViews.includes(view as ViewPermission)}
                         onChange={(e) => {
                           if (e.target.checked) setEditUserViews([...editUserViews, view as ViewPermission]);
                           else setEditUserViews(editUserViews.filter(v => v !== view));
                         }}
                         className="w-4 h-4 text-blue-600 rounded"
                       />
                       {view === 'grid' ? 'PLANTILLA' : view === 'visual' ? 'VISUAL' : view === 'summary' ? 'RESUMEN' : view === 'personal' ? 'PERSONAL' : 'ANOTACIONES'}
                     </label>
                   ))}
                 </div>
              </div>

              {editUserViews.includes('summary') && (
                 <div className="flex flex-col gap-1 bg-white p-2 rounded border border-slate-300">
                   <span className="text-sm font-semibold text-slate-700">Ver en RESUMEN:</span>
                   <select 
                     value={editUserSummaryEmployee}
                     onChange={(e) => setEditUserSummaryEmployee(e.target.value)}
                     className="px-2 py-1 border border-slate-300 rounded text-sm outline-none bg-slate-50 cursor-pointer"
                   >
                     <option value="all">Todos los empleados</option>
                     {Array.from(new Set(flatRows.filter(r => r.type === 'employee' && r.name.trim() !== '').map(r => r.name))).map((empName: any) => (
                       <option key={empName} value={empName}>{empName}</option>
                     ))}
                   </select>
                 </div>
              )}

              {editUserViews.includes('personal') && (
                 <div className="flex flex-col gap-1 bg-white p-2 rounded border border-slate-300">
                   <span className="text-sm font-semibold text-slate-700">Ver en PERSONAL:</span>
                   <select 
                     value={editUserPersonalEmployee}
                     onChange={(e) => setEditUserPersonalEmployee(e.target.value)}
                     className="px-2 py-1 border border-slate-300 rounded text-sm outline-none bg-slate-50 cursor-pointer"
                   >
                     <option value="all">Todos los empleados</option>
                     {Array.from(new Set(flatRows.filter(r => r.type === 'employee' && r.name.trim() !== '').map(r => r.name))).map((empName: any) => (
                       <option key={empName} value={empName}>{empName}</option>
                     ))}
                   </select>
                 </div>
              )}

              <div className="flex justify-end gap-3 mt-2">
                <button 
                  type="button" 
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm font-semibold text-sm"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
