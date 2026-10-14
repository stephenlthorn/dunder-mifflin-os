// Dunder Mifflin OS: top bar, the office floor plan (or the list view) as the desktop, OS windows, the taskbar, and
// the overlays: Ask Pam (⌘K), the shortcuts sheet (?) and settings. Notifications badge the tab while you're away.
// The delight layer (delight/) rides along: the Dundies, Creed's corner, ambient life and easter eggs, or none of it
// in Toby mode.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Approval, Presence, Task } from '@shared/contract';
import type { Decision } from './data/approvalsApi';
import { HR_DESK, askingIds, needYouCount } from './office/needsYou';
import { budgetAlerts, corporateBadge, extraNeedYou } from './budgets/budgetModel';
import { withDemoControls } from './budgets/demoCorporate';
import { useBudgets } from './budgets/useBudgets';
import type { PendingControl } from './chrome/windows/useControls';
import { usePhoneRing } from './notify/usePhoneRing';
import { FilterBar } from './chrome/FilterBar';
import { SettingsPopover } from './chrome/SettingsPopover';
import { Taskbar } from './chrome/Taskbar';
import { TopBar } from './chrome/TopBar';
import { titleOf } from './chrome/windows/titles';
import { WindowLayer } from './chrome/windows/WindowLayer';
import { INITIAL_WINDOWS, closeTop, focusWindow, openWindow, toggleMinimize, topWindow } from './chrome/windows/windowState';
import { useOffice } from './data/useOffice';
import { DemoBar } from './demo/DemoBar';
import { officeNowMs } from './demo/demoClock';
import { useDemoClock } from './demo/useDemoClock';
import { writesAllowed } from './data/capabilities';
import type { Overlay } from './keys/hotkeys';
import { paletteKeyLabel } from './keys/hotkeys';
import { ShortcutsSheet } from './keys/ShortcutsSheet';
import { useHotkeys } from './keys/useHotkeys';
import { ListView } from './list/ListView';
import type { FocusRequest, MapFocusTarget } from './map/useMapFocus';
import { OfficeMap } from './map/OfficeMap';
import { AwaySummary } from './notify/AwaySummary';
import { playChime } from './notify/chime';
import { useNotifications } from './notify/useNotifications';
import { type FleetFilter, filterCounts, hiddenByFilter } from './office/filters';
import { fleetCounts } from './office/status';
import { AskPam } from './pam/AskPam';
import { type PamItem, type ViewMode, buildPamItems } from './pam/items';
import { usePamRecents } from './pam/usePamRecents';
import { usePrefs } from './prefs/usePrefs';
import { NARROW_QUERY, REDUCED_MOTION_QUERY, useMediaQuery } from './useMediaQuery';
import { DelightContext } from './delight/DelightContext';
import { useDelightState } from './delight/useDelightState';
import { Credits, DundiesInvite, ToastStack } from './delight/DelightOverlays';
import { delightPamItems } from './delight/pamItems';
import { CREED_DESK } from './delight/creed/CreedNote';
import { tobyFromUrl } from './delight/mode';
import { useCeremonyInvite } from './delight/dundies/useCeremonyInvite';

const PALETTE_KEY = paletteKeyLabel(typeof navigator === 'undefined' ? '' : navigator.platform);

export function App() {
  const { state, applyLocal } = useOffice();
  const { prefs, setPref } = usePrefs();
  const { recents, remember } = usePamRecents();
  const narrow = useMediaQuery(NARROW_QUERY);
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY) || prefs.reduceMotion;
  const [wins, setWins] = useState(INITIAL_WINDOWS);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [viewPick, setViewPick] = useState<ViewMode | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [chatFor, setChatFor] = useState<string | null>(null);
  const returnFocus = useRef<Element | null>(null);
  const gear = useRef<HTMLButtonElement>(null);
  const demo = state.phase === 'demo';
  const snapshot = useMemo(() => (demo && state.snapshot ? withDemoControls(state.snapshot) : state.snapshot), [demo, state.snapshot]);
  const budgets = useBudgets(snapshot, demo);
  const [pendingControl, setPendingControl] = useState<PendingControl | undefined>(undefined);
  const writable = writesAllowed(state);
  const demoDay = useDemoClock(snapshot); // the scripted demo day ("Threat Level Midnight") runs on office time
  const now = demoDay ? officeNowMs(demoDay.clock, Date.now()) : demo && snapshot ? Date.parse(snapshot.generatedAt) : Date.now();
  const view: ViewMode = viewPick ?? (narrow ? 'list' : 'map');
  const delight = useDelightState({
    snapshot, prefs, demo, officeUtc: Boolean(demoDay), reduceMotion,
    now: () => (demoDay ? officeNowMs(demoDay.clock, Date.now()) : demo && snapshot ? Date.parse(snapshot.generatedAt) : Date.now()),
  });
  const { mode } = delight.value;
  const invite = useCeremonyInvite(!mode.toby && delight.value.dundies.phase === 'ready', delight.value.wallClock().getTime());

  const openInbox = useCallback(() => setWins((s) => openWindow(s, { kind: 'approvals' })), []);
  /** Toby stays "No bot yet" as a person; his HR desk is the approvals inbox. Creed's desk is Creed's corner. */
  const openPerson = useCallback((personId: string) => setWins((s) => openWindow(s,
    personId === HR_DESK ? { kind: 'approvals' } : personId === CREED_DESK ? { kind: 'creed' } : { kind: 'person', personId })), []);
  const openDundies = useCallback(() => setWins((s) => openWindow(s, { kind: 'dundies' })), []);
  const openArea = useCallback((areaId: string, roomId?: string) => setWins((s) => openWindow(s, { kind: 'area', areaId, roomId })), []);
  const openCalendar = useCallback(() => setWins((s) => openWindow(s, { kind: 'calendar' })), []);
  const openLedger = useCallback(() => setWins((s) => openWindow(s, { kind: 'ledger' })), []);
  const openTimeline = useCallback((personId: string) => setWins((s) => openWindow(s, { kind: 'person', personId, tab: 'timeline' })), []);
  const onTaskCreated = useCallback((task: Task) => {
    if (snapshot) applyLocal({ tasks: [...snapshot.tasks.filter((t) => t.id !== task.id), task] });
  }, [applyLocal, snapshot]);
  const notify = useNotifications(snapshot, { ...prefs, chime: mode.sounds }, openPerson); // no sound in Toby mode
  usePhoneRing(snapshot, mode.sounds);
  const onDecided = useCallback((a: Approval, decision: Decision) => {
    if (!snapshot) return;
    const approvals = (snapshot.approvals ?? []).filter((x) => x.id !== a.id);
    const still = approvals.some((x) => x.personId === a.personId);
    const back: Presence = { status: 'working', activity: `${decision === 'approve' ? 'Approved' : 'Rejected'}: ${a.title}` };
    // live, the server's next update says where they really are; the demo just goes back to work
    const presence = demo && a.personId && !still && snapshot.presence[a.personId]?.status === 'needs-input' ? { [a.personId]: back } : undefined;
    applyLocal({ approvals, ...(presence ? { presence } : {}) });
  }, [applyLocal, snapshot, demo]);

  const openOverlay = useCallback((next: Exclude<Overlay, null>) => {
    setOverlay((current) => {
      if (next === 'settings') returnFocus.current = gear.current; // Esc puts you back on the gear
      else if (!current) returnFocus.current = document.activeElement;
      return next;
    });
  }, []);
  const closeOverlay = useCallback((restore = true) => {
    setOverlay(null);
    const back = returnFocus.current;
    returnFocus.current = null;
    if (restore && (back instanceof HTMLElement || back instanceof SVGElement)) requestAnimationFrame(() => back.focus({ preventScroll: true }));
  }, []);
  const toggle = (which: Exclude<Overlay, null>) => (overlay === which ? closeOverlay() : openOverlay(which));
  const showOnMap = (target: MapFocusTarget) => {
    setViewPick((v) => (v === 'list' || (v === null && narrow) ? 'map' : v));
    setFocusRequest((r) => ({ target, seq: (r?.seq ?? 0) + 1 }));
  };

  useHotkeys(overlay, prefs, {
    'toggle-palette': () => toggle('palette'),
    'open-palette': () => openOverlay('palette'),
    'toggle-shortcuts': () => toggle('shortcuts'),
    'close-overlay': () => closeOverlay(),
    'close-window': () => setWins((s) => closeTop(s)),
  });

  useEffect(() => { // "Chat with …": focus the composer once their window is on screen (after the window focuses itself)
    if (!chatFor) return undefined;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`[data-window="person:${CSS.escape(chatFor)}"] .chat-form input`)?.focus();
      setChatFor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [chatFor, wins]);

  const run = (item: PamItem, alt: boolean) => {
    const act = alt && item.alt ? item.alt : item.action;
    if (item.kind !== 'action') remember(item.id);
    const keepsFocus = act.type === 'filter' || act.type === 'view';
    if (act.type !== 'shortcuts' && act.type !== 'settings') closeOverlay(keepsFocus);
    switch (act.type) {
      case 'open-person': return openPerson(act.personId);
      case 'chat': openPerson(act.personId); return setChatFor(act.personId);
      case 'open-area': return openArea(act.areaId, act.roomId);
      case 'show-person': return showOnMap({ kind: 'person', id: act.personId });
      case 'show-area': return showOnMap({ kind: 'area', id: act.areaId });
      case 'filter': return setFilter(act.filter);
      case 'view': return setViewPick(act.view);
      case 'calendar': return openCalendar();
      case 'ledger': return openLedger();
      case 'timeline': return openTimeline(act.personId);
      case 'control': // their window on the Desk tab, with the verb's confirmation open
        setWins((w) => openWindow(w, { kind: 'person', personId: act.personId, tab: 'desk' }));
        return setPendingControl((p) => {
          const seq = (p?.seq ?? 0) + 1;
          return { personId: act.personId, request: act.request, seq, taken: () => setPendingControl((q) => (q?.seq === seq ? undefined : q)) };
        });
      case 'dundies': return openDundies();
      case 'creed': return openPerson(CREED_DESK);
      default: return openOverlay(act.type);
    }
  };

  const counts = useMemo(() => (snapshot ? fleetCounts(snapshot.people, snapshot.presence) : null), [snapshot]);
  const hidden = useMemo(() => (snapshot ? hiddenByFilter(snapshot, filter) : new Set<string>()), [snapshot, filter]);
  const creedCount = delight.value.unattributed.length;
  const pamItems = useMemo(() => (snapshot ? [...buildPamItems(snapshot, { filter, view, writable }), ...delightPamItems({ toby: mode.toby, creedCount })] : []),
    [snapshot, filter, view, writable, mode.toby, creedCount]);
  const top = topWindow(wins);
  const source = state.phase === 'live'
    ? { kind: 'live' as const, detail: state.connected ? 'Live updates connected' : 'Live data; reconnecting to updates…' }
    : state.phase === 'demo' ? { kind: 'demo' as const, detail: state.reason } : { kind: 'loading' as const, detail: 'Loading the office…' };
  const settings = overlay === 'settings' && (
    <SettingsPopover
      prefs={prefs}
      paletteKey={PALETTE_KEY}
      permission={notify.permission}
      anchor={gear}
      onPref={setPref}
      onClose={() => closeOverlay(false)}
      onNotifications={(on) => { if (!on) setPref('notifications', false); else void notify.askPermission().then((ok) => setPref('notifications', ok)); }}
      onChime={(on) => { setPref('chime', on); if (on && !mode.toby) playChime(); }}
      tobyUrl={tobyFromUrl(window.location.search)}
    />
  );

  return (
    <DelightContext.Provider value={delight.value}>
    <div className={`os view-${view}${reduceMotion ? ' reduce-motion' : ''}${mode.toby ? ' toby-mode' : ''}`}>
      <TopBar
        counts={counts}
        source={source}
        paletteKey={PALETTE_KEY}
        onAskPam={() => toggle('palette')}
        view={view}
        onToggleView={() => setViewPick(view === 'map' ? 'list' : 'map')}
        settingsOpen={overlay === 'settings'}
        onToggleSettings={() => toggle('settings')}
        gearRef={gear}
        settings={settings}
        readOnly={state.phase === 'live' && !writable}
        onOpenCalendar={openCalendar}
        needYou={snapshot ? needYouCount(snapshot) + extraNeedYou(budgetAlerts(budgets), askingIds(snapshot)) : null}
        onOpenInbox={openInbox}
        corporate={corporateBadge(budgets)}
        onOpenCorporate={openLedger}
        demo={demoDay ? <DemoBar day={demoDay} writable={writable} /> : undefined}
      />
      <main className="desktop">
        {!snapshot && <p className="loading" role="status">Opening the office…</p>}
        {snapshot && view === 'map' && (
          <OfficeMap snapshot={snapshot} live={!demo} hidden={hidden} focusRequest={focusRequest} reduceMotion={reduceMotion} onOpenPerson={openPerson} onOpenArea={openArea}
            onOpenCalendar={openCalendar} onOpenLedger={openLedger} />
        )}
        {snapshot && view === 'list' && (
          <ListView snapshot={snapshot} filter={filter} live={!demo} onFilter={setFilter} onOpenPerson={openPerson} onOpenArea={openArea} />
        )}
        {snapshot && view === 'map' && counts && (
          <FilterBar filter={filter} shown={filter === 'all' ? 0 : filterCounts(snapshot)[filter]} bots={counts.bots} onClear={() => setFilter('all')} />
        )}
        {notify.report && <AwaySummary report={notify.report} onOpenPerson={openPerson} onDismiss={notify.dismissReport} />}
        {snapshot && (
          <WindowLayer wins={wins} setWins={setWins} snapshot={snapshot} demo={demo} writable={writable} now={now} sheet={narrow}
            onOpenPerson={openPerson} onOpenArea={openArea} onTaskCreated={onTaskCreated} onDecided={onDecided} onOpenLedger={openLedger} onOpenTimeline={openTimeline}
            onOpenCalendar={openCalendar} budgets={budgets} pendingControl={pendingControl} />
        )}
      </main>
      <Taskbar
        windows={wins.windows}
        topId={top?.id}
        titleOf={(w) => titleOf(w, snapshot, mode.toby)}
        onActivate={(id) => setWins((s) => (topWindow(s)?.id === id ? toggleMinimize(s, id) : focusWindow(s, id)))}
        hint={narrow ? 'Tap anyone to open their window.' : `Click anyone${view === 'map' ? ' on the map' : ''} to open their window. ${PALETTE_KEY} asks Pam.`}
      />
      {overlay === 'palette' && snapshot && (
        <AskPam snapshot={snapshot} items={pamItems} recents={recents} live={!demo} onRun={run} onClose={() => closeOverlay()} />
      )}
      {overlay === 'shortcuts' && <ShortcutsSheet paletteKey={PALETTE_KEY} singleKeys={prefs.singleKeys} onClose={() => closeOverlay()} />}
      {invite.invited && delight.value.dundies.phase === 'ready' && delight.value.dundies.digest.awards.length > 0 && (
        <DundiesInvite awards={delight.value.dundies.digest.awards.length} onStart={() => { invite.seen(); openDundies(); }} onDismiss={invite.seen} />
      )}
      {delight.credits && snapshot && <Credits snapshot={snapshot} motion={mode.motion} onClose={delight.closeCredits} />}
      <ToastStack toasts={delight.toasts} />
    </div>
    </DelightContext.Provider>
  );
}
