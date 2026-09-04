'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useGame } from '@/context/GameContext';
import { Tool } from '@/types/game';
import { useMobile } from '@/hooks/useMobile';
import { MobileToolbar } from '@/components/mobile/MobileToolbar';
import { MobileTopBar } from '@/components/mobile/MobileTopBar';
import { msg, useMessages, useGT } from 'gt-next';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useCheatCodes } from '@/hooks/useCheatCodes';
import { VinnieDialog } from '@/components/VinnieDialog';
import { CommandMenu } from '@/components/ui/CommandMenu';
import { TipToast } from '@/components/ui/TipToast';
import { useTipSystem } from '@/hooks/useTipSystem';
import { useMultiplayerSync } from '@/hooks/useMultiplayerSync';
import { useCopyRoomLink } from '@/hooks/useCopyRoomLink';
import { useMultiplayerOptional } from '@/context/MultiplayerContext';
import { ShareModal } from '@/components/multiplayer/ShareModal';
import { Copy, Check } from 'lucide-react';

import { OverlayMode } from '@/components/game/types';
import { getOverlayForTool } from '@/components/game/overlays';
import { OverlayModeToggle } from '@/components/game/OverlayModeToggle';
import { Sidebar } from '@/components/game/Sidebar';
import {
  BudgetPanel,
  StatisticsPanel,
  SettingsPanel,
  AdvisorsPanel,
} from '@/components/game/panels';
import { MiniMap } from '@/components/game/MiniMap';
import { TopBar, StatsPanel } from '@/components/game/TopBar';
import { CanvasIsometricGrid } from '@/components/game/CanvasIsometricGrid';
import { AutoModeControl } from '@/components/game/AutoModeControl';
import { CityDetailOverlay } from '@/components/game/CityDetailOverlay';

const CARGO_TYPE_NAMES = [msg('containers'), msg('bulk materials'), msg('oil')];

type ViewportState = {
  offset: { x: number; y: number };
  zoom: number;
  canvasSize: { width: number; height: number };
};

export default function Game({ onExit }: { onExit?: () => void }) {
  const gt = useGT();
  const m = useMessages();
  const { state, setTool, setActivePanel, addMoney, addNotification, setSpeed } = useGame();
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('none');
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState<ViewportState | null>(null);
  const isInitialMount = useRef(true);
  const { isMobileDevice, isSmallScreen } = useMobile();
  const isMobile = isMobileDevice || isSmallScreen;
  const [showShareModal, setShowShareModal] = useState(false);
  const multiplayer = useMultiplayerOptional();

  const {
    triggeredCheat,
    showVinnieDialog,
    setShowVinnieDialog,
    clearTriggeredCheat,
  } = useCheatCodes();

  const {
    currentTip,
    isVisible: isTipVisible,
    onContinue: onTipContinue,
    onSkipAll: onTipSkipAll,
  } = useTipSystem(state);

  const {
    isMultiplayer,
    roomCode,
    players,
  } = useMultiplayerSync();

  const { copied: copiedRoomLink, handleCopyRoomLink } = useCopyRoomLink(roomCode, 'coop');
  const initialSelectedToolRef = useRef<Tool | null>(null);
  const previousSelectedToolRef = useRef<Tool | null>(null);
  const hasCapturedInitialTool = useRef(false);
  const currentSelectedToolRef = useRef<Tool>(state.selectedTool);

  useEffect(() => {
    currentSelectedToolRef.current = state.selectedTool;
  }, [state.selectedTool]);

  useEffect(() => {
    if (!hasCapturedInitialTool.current) {
      const timeoutId = setTimeout(() => {
        initialSelectedToolRef.current = currentSelectedToolRef.current;
        previousSelectedToolRef.current = currentSelectedToolRef.current;
        hasCapturedInitialTool.current = true;
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (state.selectedTool === 'select') {
      setTimeout(() => setOverlayMode('none'), 0);
      previousSelectedToolRef.current = state.selectedTool;
      return;
    }

    if (state.selectedTool === 'subway' || state.selectedTool === 'subway_station') {
      setTimeout(() => setOverlayMode('subway'), 0);
      previousSelectedToolRef.current = state.selectedTool;
      return;
    }

    if (!hasCapturedInitialTool.current) return;
    if (initialSelectedToolRef.current !== null && initialSelectedToolRef.current === state.selectedTool) return;
    if (previousSelectedToolRef.current === state.selectedTool) return;

    previousSelectedToolRef.current = state.selectedTool;
    setTimeout(() => setOverlayMode(getOverlayForTool(state.selectedTool)), 0);
  }, [state.selectedTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'Escape') {
        if (overlayMode !== 'none') setOverlayMode('none');
        else if (state.activePanel !== 'none') setActivePanel('none');
        else if (selectedTile) setSelectedTile(null);
        else if (state.selectedTool !== 'select') setTool('select');
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setTool('bulldoze');
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setSpeed(state.speed === 0 ? 1 : 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.activePanel, state.selectedTool, state.speed, selectedTile, setActivePanel, setTool, setSpeed, overlayMode]);

  useEffect(() => {
    if (!triggeredCheat) return;

    switch (triggeredCheat.type) {
      case 'konami':
        addMoney(triggeredCheat.amount);
        addNotification(
          gt('Retro Cheat Activated!'),
          gt('Your accountants are confused but not complaining. You received $50,000!'),
          'trophy',
        );
        clearTriggeredCheat();
        break;
      case 'motherlode':
        addMoney(triggeredCheat.amount);
        addNotification(
          gt('Motherlode!'),
          gt('Your treasury just got a lot heavier. You received $1,000,000!'),
          'trophy',
        );
        clearTriggeredCheat();
        break;
      case 'vinnie':
        clearTriggeredCheat();
        break;
    }
  }, [triggeredCheat, addMoney, addNotification, clearTriggeredCheat, gt]);

  const bargeDeliveryCountRef = useRef(0);
  const handleBargeDelivery = useCallback((cargoValue: number, cargoType: number) => {
    addMoney(cargoValue);
    bargeDeliveryCountRef.current++;

    if (bargeDeliveryCountRef.current % 5 === 1) {
      const cargoName = CARGO_TYPE_NAMES[cargoType] || msg('cargo');
      addNotification(
        gt('Cargo Delivered'),
        gt('A shipment of {cargoName} has arrived at the marina. +${cargoValue} trade revenue.', { cargoName: m(cargoName), cargoValue }),
        'ship',
      );
    }
  }, [addMoney, addNotification, gt, m]);

  if (isMobile) {
    return (
      <TooltipProvider>
        <div className="w-full h-full overflow-hidden bg-background flex flex-col">
          <MobileTopBar
            selectedTile={selectedTile && state.selectedTool === 'select' ? state.grid[selectedTile.y][selectedTile.x] : null}
            services={state.services}
            onCloseTile={() => setSelectedTile(null)}
            onShare={() => setShowShareModal(true)}
            onExit={onExit}
          />

          {multiplayer && <ShareModal open={showShareModal} onOpenChange={setShowShareModal} />}

          <div className="flex-1 relative overflow-hidden" style={{ paddingTop: '72px', paddingBottom: '76px' }}>
            <CanvasIsometricGrid
              overlayMode={overlayMode}
              selectedTile={selectedTile}
              setSelectedTile={setSelectedTile}
              isMobile={true}
              onViewportChange={setViewport}
              onBargeDelivery={handleBargeDelivery}
            />
            <CityDetailOverlay viewport={viewport} mobile />
            <AutoModeControl compact />

            {isMultiplayer && (
              <div className="absolute top-2 right-2 z-20">
                <div className="bg-slate-900/90 border border-slate-700 rounded-lg px-2 py-1.5 shadow-lg">
                  <div className="flex items-center gap-1.5 text-xs text-white">
                    {roomCode && (
                      <>
                        <span className="font-mono tracking-wider">{roomCode}</span>
                        <button onClick={handleCopyRoomLink} className="p-0.5 hover:bg-white/10 rounded transition-colors" title="Copy invite link">
                          {copiedRoomLink ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                        </button>
                      </>
                    )}
                  </div>
                  {players.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {players.map((player) => (
                        <div key={player.id} className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {player.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <MobileToolbar
            onOpenPanel={(panel) => setActivePanel(panel)}
            overlayMode={overlayMode}
            setOverlayMode={setOverlayMode}
          />

          {state.activePanel === 'budget' && <BudgetPanel />}
          {state.activePanel === 'statistics' && <StatisticsPanel />}
          {state.activePanel === 'advisors' && <AdvisorsPanel />}
          {state.activePanel === 'settings' && <SettingsPanel />}

          <VinnieDialog open={showVinnieDialog} onOpenChange={setShowVinnieDialog} />
          <TipToast message={currentTip || ''} isVisible={isTipVisible} onContinue={onTipContinue} onSkipAll={onTipSkipAll} />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="w-full h-full min-h-[720px] overflow-hidden bg-background flex">
        <Sidebar onExit={onExit} />

        <div className="flex-1 flex flex-col ml-56">
          <TopBar />
          <StatsPanel />
          <div className="flex-1 relative overflow-visible">
            <CanvasIsometricGrid
              overlayMode={overlayMode}
              selectedTile={selectedTile}
              setSelectedTile={setSelectedTile}
              navigationTarget={navigationTarget}
              onNavigationComplete={() => setNavigationTarget(null)}
              onViewportChange={setViewport}
              onBargeDelivery={handleBargeDelivery}
            />
            <CityDetailOverlay viewport={viewport} />
            <OverlayModeToggle overlayMode={overlayMode} setOverlayMode={setOverlayMode} />
            <MiniMap onNavigate={(x, y) => setNavigationTarget({ x, y })} viewport={viewport} />
            <AutoModeControl />

            {isMultiplayer && (
              <div className="absolute top-4 right-4 z-20">
                <div className="bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 shadow-lg min-w-[120px]">
                  <div className="flex items-center gap-2 text-sm text-white">
                    {roomCode && (
                      <>
                        <span className="font-mono font-medium tracking-wider">{roomCode}</span>
                        <button onClick={handleCopyRoomLink} className="p-1 hover:bg-white/10 rounded transition-colors" title="Copy invite link">
                          {copiedRoomLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />}
                        </button>
                      </>
                    )}
                  </div>
                  {players.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {players.map((player) => (
                        <div key={player.id} className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          {player.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {state.activePanel === 'budget' && <BudgetPanel />}
        {state.activePanel === 'statistics' && <StatisticsPanel />}
        {state.activePanel === 'advisors' && <AdvisorsPanel />}
        {state.activePanel === 'settings' && <SettingsPanel />}

        <VinnieDialog open={showVinnieDialog} onOpenChange={setShowVinnieDialog} />
        <CommandMenu />
        <TipToast message={currentTip || ''} isVisible={isTipVisible} onContinue={onTipContinue} onSkipAll={onTipSkipAll} />
      </div>
    </TooltipProvider>
  );
}
