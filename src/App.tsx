import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import './App.css'
import importIcon from './assets/import.svg'
import exportIcon from './assets/export.svg'
import deleteIcon from './assets/delete.svg'
import editIcon from './assets/edit.svg'
import listIcon from './assets/list.svg'
import { useAuth } from './auth/AuthProvider'
import { pb } from './lib/pocketbase'
import { GroupPageContainer } from './pages/GroupPageContainer.tsx'
import { CustomSelect } from './components/CustomSelect'

type Tab = 'metro' | 'tracks' | 'setlists' | 'groups'
type SourceMode = 'all' | 'setlist'
type ClickPreset = 'beep' | 'wood' | 'rim'
type Track = { id: number; name: string; bpm: number; sig: string; notes: string; sheet: string }
type Setlist = { id: number; name: string; tracks: number[] }
type Band = { id: string; name: string; description: string; ownerId?: string; isLocal?: boolean }
type BandDataPayload = { tracks: Track[]; setlists: Setlist[]; nextTrackId: number; nextSetlistId: number }
type BandInvite = { id: string; token: string; isActive: boolean; expiresAt: string }
type BandMember = {
  id: string
  userId: string
  email: string
  name: string
  avatarUrl: string
  instrument: string
  role: string
}
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type PersistedData = { tracks: Track[]; setlists: Setlist[]; nextTrackId: number; nextSetlistId: number }
type PersistedUi = {
  tab: Tab
  sourceMode: SourceMode
  activeSetlistId: number | null
  selectedTrackId: number | null
  bpm: number
  beatsPerBar: number
  division: number
  volume: number
  clickPreset: ClickPreset
  wakeLockEnabled: boolean
}

const UI_STORAGE_KEY = 'clicktrack-ui-v1'
const ACTIVE_BAND_STORAGE_KEY = 'clicktrack-active-band'
const BAND_LOCAL_DATA_PREFIX = 'clicktrack-band-data'
const BANDS_LOCAL_LIST_PREFIX = 'clicktrack-bands'
const starterTracks: Track[] = [{ id: 1, name: 'Пример трека', bpm: 120, sig: '4/4', notes: '', sheet: '' }]
const starterSetlists: Setlist[] = []
const emptyBandData: BandDataPayload = {
  tracks: starterTracks,
  setlists: starterSetlists,
  nextTrackId: 2,
  nextSetlistId: 1,
}

const clampBpm = (v: number): number => Math.max(20, Math.min(280, Math.round(v)))
const signatureToBeats = (sig: string): number => Number(sig.split('/')[0]) || 4
const normalizeTrack = (track: Partial<Track> & { id: number }): Track => ({
  id: track.id,
  name: track.name ?? '',
  bpm: typeof track.bpm === 'number' ? track.bpm : 120,
  sig: track.sig ?? '4/4',
  notes: track.notes ?? '',
  sheet: track.sheet ?? '',
})

function App() {
  const { signOut, userId, userEmail } = useAuth()
  const { bandId: routeBandId, trackId: routeTrackId } = useParams<{ bandId?: string; trackId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const isGroupPage = Boolean(routeBandId)
  const isTrackPage = Boolean(routeTrackId)
  const [tab, setTab] = useState<Tab>('metro')
  const [bpm, setBpm] = useState<number>(120)
  const [beatsPerBar, setBeatsPerBar] = useState<number>(4)
  const [division, setDivision] = useState<number>(4)
  const [volume, setVolume] = useState<number>(6)
  const [clickPreset, setClickPreset] = useState<ClickPreset>('beep')
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentBeat, setCurrentBeat] = useState<number>(0)
  const [sourceMode, setSourceMode] = useState<SourceMode>('all')
  const [activeSetlistId, setActiveSetlistId] = useState<number | null>(null)
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null)
  const [showTrackModal, setShowTrackModal] = useState<boolean>(false)
  const [showSetlistModal, setShowSetlistModal] = useState<boolean>(false)
  const [setlistTracksEditor, setSetlistTracksEditor] = useState<Setlist | null>(null)
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null)
  const [trackToDelete, setTrackToDelete] = useState<Track | null>(null)
  const [setlistToDelete, setSetlistToDelete] = useState<Setlist | null>(null)
  const [setlistToRename, setSetlistToRename] = useState<Setlist | null>(null)
  const [setlistTrackToDelete, setSetlistTrackToDelete] = useState<{
    setlistId: number
    index: number
    trackName: string
  } | null>(null)
  const [renameSetlistValue, setRenameSetlistValue] = useState<string>('')
  const [newTrack, setNewTrack] = useState<Omit<Track, 'id'>>({ name: '', bpm: 120, sig: '4/4', notes: '', sheet: '' })
  const [newSetlistName, setNewSetlistName] = useState<string>('')
  const [newSetlistTrackIds, setNewSetlistTrackIds] = useState<number[]>([])
  const [editingSetlistTrackIds, setEditingSetlistTrackIds] = useState<number[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [setlists, setSetlists] = useState<Setlist[]>([])
  const [nextTrackId, setNextTrackId] = useState<number>(1)
  const [nextSetlistId, setNextSetlistId] = useState<number>(1)
  const [bands, setBands] = useState<Band[]>([])
  const [activeBandId, setActiveBandId] = useState<string | null>(null)
  const [bandDataRecordId, setBandDataRecordId] = useState<string | null>(null)
  const [creatingBand, setCreatingBand] = useState<boolean>(false)
  const [showBandModal, setShowBandModal] = useState<boolean>(false)
  const [inviteLink, setInviteLink] = useState<string>('')
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false)
  const [inviteBand, setInviteBand] = useState<Band | null>(null)
  const [bandInvites, setBandInvites] = useState<BandInvite[]>([])
  const [invitesLoading, setInvitesLoading] = useState<boolean>(false)
  const [bandMembers, setBandMembers] = useState<BandMember[]>([])
  const [membersLoading, setMembersLoading] = useState<boolean>(false)
  const [canManageMembers, setCanManageMembers] = useState<boolean>(false)
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string>('')
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false)
  const [mobileHeaderOpen, setMobileHeaderOpen] = useState<boolean>(false)
  const [newBandName, setNewBandName] = useState<string>('')
  const [newBandDescription, setNewBandDescription] = useState<string>('')
  const [editingBandId, setEditingBandId] = useState<string | null>(null)
  const [editingBandName, setEditingBandName] = useState<string>('')
  const [editingBandDescription, setEditingBandDescription] = useState<string>('')
  const [dragInfo, setDragInfo] = useState<{ setlistId: number; fromIndex: number } | null>(null)
  const [wakeLockEnabled, setWakeLockEnabled] = useState<boolean>(true)
  const [wakeLockSupported, setWakeLockSupported] = useState<boolean>(false)
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  const [isStandalone, setIsStandalone] = useState<boolean>(
    window.matchMedia('(display-mode: standalone)').matches,
  )
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const isPlayingRef = useRef<boolean>(false)
  const recoveringAudioRef = useRef<boolean>(false)
  const bandDataReadyRef = useRef<boolean>(false)
  const saveBandDataTimeoutRef = useRef<number | null>(null)
  const schedulerRef = useRef<number | null>(null)
  const nextNoteTimeRef = useRef<number>(0)
  const beatIndexRef = useRef<number>(0)
  const tapTimesRef = useRef<number[]>([])
  const toastTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setWakeLockSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator)
    const uiRaw = localStorage.getItem(UI_STORAGE_KEY)
    if (uiRaw) {
      try {
        const parsed = JSON.parse(uiRaw) as PersistedUi
        if (parsed.tab) setTab(parsed.tab)
        if (parsed.sourceMode) setSourceMode(parsed.sourceMode)
        if (typeof parsed.activeSetlistId === 'number') setActiveSetlistId(parsed.activeSetlistId)
        if (typeof parsed.selectedTrackId === 'number') setSelectedTrackId(parsed.selectedTrackId)
        if (typeof parsed.bpm === 'number') setBpm(clampBpm(parsed.bpm))
        if (typeof parsed.beatsPerBar === 'number') setBeatsPerBar(parsed.beatsPerBar)
        if (typeof parsed.division === 'number') setDivision(parsed.division)
        if (typeof parsed.volume === 'number') setVolume(Math.max(0, Math.min(10, parsed.volume)))
        if (parsed.clickPreset === 'beep' || parsed.clickPreset === 'wood' || parsed.clickPreset === 'rim') {
          setClickPreset(parsed.clickPreset)
        }
        if (typeof parsed.wakeLockEnabled === 'boolean') setWakeLockEnabled(parsed.wakeLockEnabled)
      } catch {
        localStorage.removeItem(UI_STORAGE_KEY)
      }
    }
  }, [])

  useEffect(() => {
    const onOnline = (): void => setIsOnline(true)
    const onOffline = (): void => setIsOnline(false)
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const onDisplayModeChange = (): void => {
      setIsStandalone(mediaQuery.matches)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    mediaQuery.addEventListener('change', onDisplayModeChange)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      mediaQuery.removeEventListener('change', onDisplayModeChange)
    }
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onAppInstalled = (): void => {
      setInstallPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  useEffect(() => {
    const payload: PersistedUi = {
      tab,
      sourceMode,
      activeSetlistId,
      selectedTrackId,
      bpm,
      beatsPerBar,
      division,
      volume,
      clickPreset,
      wakeLockEnabled,
    }
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(payload))
  }, [tab, sourceMode, activeSetlistId, selectedTrackId, bpm, beatsPerBar, division, volume, clickPreset, wakeLockEnabled])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    if (!activeSetlistId && setlists.length) setActiveSetlistId(setlists[0].id)
  }, [activeSetlistId, setlists])

  useEffect(() => {
    if (activeSetlistId === null) return
    if (!setlists.some((setlist) => setlist.id === activeSetlistId)) {
      setActiveSetlistId(setlists.length ? setlists[0].id : null)
    }
  }, [activeSetlistId, setlists])

  useEffect(() => {
    setSelectedTrackId(null)
    setActiveSetlistId(null)
  }, [activeBandId])

  useEffect(() => {
    if (!selectedTrackId) return
    if (!tracks.find((t) => t.id === selectedTrackId)) setSelectedTrackId(null)
  }, [selectedTrackId, tracks])

  const sourceTracks = useMemo(() => {
    if (sourceMode === 'all') return tracks
    const active = setlists.find((s) => s.id === activeSetlistId)
    if (!active) return []
    return active.tracks.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[]
  }, [sourceMode, tracks, setlists, activeSetlistId])

  const selectedTrack = useMemo(() => tracks.find((t) => t.id === selectedTrackId) ?? null, [tracks, selectedTrackId])
  const routeTrack = useMemo(() => {
    if (!routeTrackId) return null
    const id = Number(routeTrackId)
    if (!Number.isFinite(id)) return null
    return tracks.find((track) => track.id === id) ?? null
  }, [routeTrackId, tracks])
  const trackPageContext = useMemo(() => {
    const search = new URLSearchParams(location.search)
    const from = search.get('from')
    const setlistIdRaw = search.get('setlistId')
    const parsedSetlistId = setlistIdRaw ? Number(setlistIdRaw) : null
    return {
      fromSetlist: from === 'setlist',
      setlistId: parsedSetlistId !== null && Number.isFinite(parsedSetlistId) ? parsedSetlistId : null,
    }
  }, [location.search])
  const trackPageSetlistNavigation = useMemo(() => {
    if (!trackPageContext.fromSetlist || trackPageContext.setlistId === null || !routeTrack) {
      return { previous: null as Track | null, next: null as Track | null }
    }
    const setlist = setlists.find((item) => item.id === trackPageContext.setlistId)
    if (!setlist) return { previous: null as Track | null, next: null as Track | null }
    const currentIndex = setlist.tracks.findIndex((id) => id === routeTrack.id)
    if (currentIndex < 0) return { previous: null as Track | null, next: null as Track | null }
    const previousId = currentIndex > 0 ? setlist.tracks[currentIndex - 1] : null
    const nextId = currentIndex < setlist.tracks.length - 1 ? setlist.tracks[currentIndex + 1] : null
    const previous = previousId !== null ? tracks.find((track) => track.id === previousId) ?? null : null
    const next = nextId !== null ? tracks.find((track) => track.id === nextId) ?? null : null
    return { previous, next }
  }, [trackPageContext.fromSetlist, trackPageContext.setlistId, routeTrack, setlists, tracks])
  const selectedTrackIndex = useMemo(
    () => sourceTracks.findIndex((track) => track.id === selectedTrackId),
    [sourceTracks, selectedTrackId],
  )

  const ensureAudioContext = async (): Promise<AudioContext> => {
    if (!audioCtxRef.current) audioCtxRef.current = new window.AudioContext()
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
    return audioCtxRef.current
  }
  const stopScheduler = (): void => {
    if (!schedulerRef.current) return
    window.clearInterval(schedulerRef.current)
    schedulerRef.current = null
  }
  const scheduleClick = (ctx: AudioContext, time: number, isDownbeat: boolean): void => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const presetConfig = {
      beep: { type: 'triangle' as OscillatorType, downbeat: 1320, beat: 920, peak: 0.28, decay: 0.05 },
      wood: { type: 'square' as OscillatorType, downbeat: 980, beat: 760, peak: 0.2, decay: 0.035 },
      rim: { type: 'sine' as OscillatorType, downbeat: 1650, beat: 1250, peak: 0.26, decay: 0.03 },
    }[clickPreset]
    osc.type = presetConfig.type
    osc.frequency.value = isDownbeat ? presetConfig.downbeat : presetConfig.beat
    // Non-linear curve: higher values produce a clearly stronger boost.
    const loudnessBoost = Math.pow(Math.max(volume, 0), 1.65)
    const peakGain = (isDownbeat ? presetConfig.peak : presetConfig.peak * 0.75) * loudnessBoost
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(peakGain, time + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + presetConfig.decay)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(time)
    osc.stop(time + presetConfig.decay + 0.015)
  }
  const startScheduler = async (): Promise<void> => {
    const ctx = await ensureAudioContext()
    stopScheduler()
    const secondsPerBeat = 60 / bpm
    nextNoteTimeRef.current = ctx.currentTime + 0.04
    beatIndexRef.current = 0
    setCurrentBeat(0)
    schedulerRef.current = window.setInterval(() => {
      while (nextNoteTimeRef.current < ctx.currentTime + 0.12) {
        const beatInBar = beatIndexRef.current % beatsPerBar
        scheduleClick(ctx, nextNoteTimeRef.current, beatInBar === 0)
        const delayMs = Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000)
        window.setTimeout(() => setCurrentBeat(beatInBar), delayMs)
        beatIndexRef.current += 1
        nextNoteTimeRef.current += secondsPerBeat
      }
    }, 25)
  }
  const setBpmSafe = (value: number): void => setBpm(clampBpm(value))
  const acquireWakeLock = async (): Promise<void> => {
    if (!wakeLockEnabled || !wakeLockSupported || wakeLockRef.current) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null
      })
    } catch {
      // ignore wake lock request failures
    }
  }
  const releaseWakeLock = async (): Promise<void> => {
    if (!wakeLockRef.current) return
    try {
      await wakeLockRef.current.release()
    } catch {
      // ignore release errors
    } finally {
      wakeLockRef.current = null
    }
  }
  const handlePlayToggle = async (): Promise<void> => {
    if (isPlaying) {
      setIsPlaying(false)
      stopScheduler()
      await releaseWakeLock()
      setCurrentBeat(0)
    } else {
      setIsPlaying(true)
      await startScheduler()
      await acquireWakeLock()
    }
  }

  useEffect(() => {
    if (isPlaying) void startScheduler()
  }, [bpm, beatsPerBar, isPlaying])
  useEffect(
    () => () => {
      stopScheduler()
      void releaseWakeLock()
      if (audioCtxRef.current) void audioCtxRef.current.close()
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      if (saveBandDataTimeoutRef.current) window.clearTimeout(saveBandDataTimeoutRef.current)
    },
    [],
  )

  const showToast = (message: string): void => {
    setToastMessage(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2200)
  }

  const getBandLocalDataKey = (bandId: string): string => {
    const scope = userId ?? 'anon'
    return `${BAND_LOCAL_DATA_PREFIX}:${scope}:${bandId}`
  }
  const getBandsListLocalKey = (): string => {
    const scope = userId ?? 'anon'
    return `${BANDS_LOCAL_LIST_PREFIX}:${scope}`
  }

  const saveBandDataLocal = (bandId: string, payload: BandDataPayload): void => {
    localStorage.setItem(getBandLocalDataKey(bandId), JSON.stringify(payload))
  }

  const loadBandDataLocal = (bandId: string): BandDataPayload | null => {
    const raw = localStorage.getItem(getBandLocalDataKey(bandId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as BandDataPayload
    } catch {
      localStorage.removeItem(getBandLocalDataKey(bandId))
      return null
    }
  }

  const saveBandsLocal = (nextBands: Band[]): void => {
    localStorage.setItem(getBandsListLocalKey(), JSON.stringify(nextBands))
  }

  const loadBandsLocal = (): Band[] => {
    const raw = localStorage.getItem(getBandsListLocalKey())
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Band[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      localStorage.removeItem(getBandsListLocalKey())
      return []
    }
  }

  const applyBandData = (payload: BandDataPayload): void => {
    const normalizedTracks = (payload.tracks ?? []).map((track) => normalizeTrack(track))
    setTracks(normalizedTracks)
    setSetlists(payload.setlists ?? [])
    setNextTrackId(payload.nextTrackId ?? 1)
    setNextSetlistId(payload.nextSetlistId ?? 1)
  }

  const loadBandData = async (bandId: string): Promise<void> => {
    bandDataReadyRef.current = false
    const localData = loadBandDataLocal(bandId)

    if (bandId.startsWith('local-')) {
      if (!localData) {
        applyBandData(emptyBandData)
        saveBandDataLocal(bandId, emptyBandData)
      }
      setBandDataRecordId(null)
      bandDataReadyRef.current = true
      return
    }

    try {
      const existing = await pb.collection('band_data').getList(1, 1, {
        filter: `band="${bandId}"`,
      })
      if (existing.items.length > 0) {
        const record = existing.items[0]
        setBandDataRecordId(record.id)
        const rawPayload = record.payload
        const cloudPayload = (rawPayload && typeof rawPayload === 'object' ? rawPayload : emptyBandData) as BandDataPayload
        const cloudLooksEmpty =
          (!cloudPayload.tracks || cloudPayload.tracks.length === 0) &&
          (!cloudPayload.setlists || cloudPayload.setlists.length === 0)
        const payload = localData && cloudLooksEmpty ? localData : cloudPayload
        applyBandData(payload)
        saveBandDataLocal(bandId, payload)
      } else {
        const created = await pb.collection('band_data').create({
          band: bandId,
          payload: localData ?? emptyBandData,
        })
        setBandDataRecordId(created.id)
        const payload = localData ?? emptyBandData
        applyBandData(payload)
        saveBandDataLocal(bandId, payload)
      }
      bandDataReadyRef.current = true
    } catch {
      setBandDataRecordId(null)
      const payload = localData ?? emptyBandData
      applyBandData(payload)
      saveBandDataLocal(bandId, payload)
      bandDataReadyRef.current = true
    }
  }

  const loadBands = async (): Promise<void> => {
    if (!userId) return
    try {
      const members = await pb.collection('band_members').getFullList({
        filter: `user="${userId}"`,
        expand: 'band',
      })
      const mappedBandsFromExpand = members
        .map((member) => {
          const expandedBand = member.expand?.band
          if (!expandedBand || Array.isArray(expandedBand)) return null
          return {
            id: expandedBand.id,
            name: (expandedBand.name as string) || 'Без названия',
            description: (expandedBand.description as string) || '',
            ownerId: (expandedBand.owner as string) || undefined,
            isLocal: false,
          } as Band
        })
        .filter(Boolean) as Band[]
      const memberBandIds = members
        .map((member) => (Array.isArray(member.band) ? member.band[0] : (member.band as string | undefined)))
        .filter((id): id is string => Boolean(id))
      const mappedBandIds = new Set(mappedBandsFromExpand.map((band) => band.id))
      const missingBandIds = memberBandIds.filter((id) => !mappedBandIds.has(id))
      const loadedMissingBands: Band[] = []
      for (const bandId of missingBandIds) {
        try {
          const bandRecord = await pb.collection('bands').getOne(bandId)
          loadedMissingBands.push({
            id: bandRecord.id,
            name: (bandRecord.name as string) || 'Без названия',
            description: (bandRecord.description as string) || '',
            ownerId: (bandRecord.owner as string) || undefined,
            isLocal: false,
          })
        } catch {
          // ignore deleted/inaccessible bands, but keep other memberships
        }
      }
      const mappedBands = [...mappedBandsFromExpand, ...loadedMissingBands]

      if (mappedBands.length === 0) {
        try {
          const createdBand = await pb.collection('bands').create({
            name: 'Моя группа',
            owner: userId,
          })
          await pb.collection('band_members').create({
            band: createdBand.id,
            user: userId,
            role: 'owner',
            ...getCurrentMemberSnapshot(),
          })
          const initialBand = {
            id: createdBand.id,
            name: (createdBand.name as string) || 'Моя группа',
            description: (createdBand.description as string) || '',
            ownerId: (createdBand.owner as string) || userId,
            isLocal: false,
          }
          setBands([initialBand])
          saveBandsLocal([initialBand])
          setActiveBandId(initialBand.id)
          localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, initialBand.id)
        } catch {
          const localBands = loadBandsLocal()
          const localBand = localBands[0] ?? { id: `local-${userId}`, name: 'Моя группа', description: '', isLocal: true }
          const nextBands = localBands.length ? localBands : [localBand]
          setBands(nextBands)
          saveBandsLocal(nextBands)
          setActiveBandId(localBand.id)
          localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, localBand.id)
          showToast('Сервер групп недоступен: включен локальный режим')
        }
        return
      }

      const localBands = loadBandsLocal()
      const localById = new Map(localBands.map((band) => [band.id, band]))
      const mergedCloudBands = mappedBands.map((band) => {
        const localBand = localById.get(band.id)
        return localBand ? { ...band, name: localBand.name || band.name, description: localBand.description || band.description } : band
      })
      const cloudIds = new Set(mergedCloudBands.map((band) => band.id))
      // Keep only explicit local fallback groups (local-*) from cache.
      // Cloud-origin groups removed from membership must not reappear from local cache.
      const mergedBands = [
        ...mergedCloudBands,
        ...localBands.filter((band) => band.id.startsWith('local-') && !cloudIds.has(band.id)),
      ]

      setBands(mergedBands)
      saveBandsLocal(mergedBands)
      const savedBandId = localStorage.getItem(ACTIVE_BAND_STORAGE_KEY)
      const nextBandId =
        savedBandId && mergedBands.some((band) => band.id === savedBandId) ? savedBandId : mergedBands[0].id
      setActiveBandId(nextBandId)
      localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, nextBandId)
    } catch {
      const localBands = loadBandsLocal()
      const localBand = localBands[0] ?? { id: `local-${userId}`, name: 'Моя группа', description: '', isLocal: true }
      const nextBands = localBands.length ? localBands : [localBand]
      setBands(nextBands)
      saveBandsLocal(nextBands)
      setActiveBandId(localBand.id)
      localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, localBand.id)
      showToast('Не удалось загрузить группы: включен локальный режим')
    }
  }

  const createBand = async (): Promise<void> => {
    if (!userId || !newBandName.trim()) return
    const name = newBandName.trim()
    const description = newBandDescription.trim()
    setCreatingBand(true)
    try {
      const createdBand = await pb.collection('bands').create({
        name,
        description,
        owner: userId,
      })
      await pb.collection('band_members').create({
        band: createdBand.id,
        user: userId,
        role: 'owner',
        ...getCurrentMemberSnapshot(),
      })
      const newBand = {
        id: createdBand.id,
        name: (createdBand.name as string) || name,
        description: (createdBand.description as string) || description,
        ownerId: (createdBand.owner as string) || userId,
        isLocal: false,
      }
      setBands((prev) => {
        const next = [...prev, newBand]
        saveBandsLocal(next)
        return next
      })
      setActiveBandId(newBand.id)
      localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, newBand.id)
      showToast(`Группа "${newBand.name}" создана`)
    } catch {
      const localBand = { id: `local-${Date.now()}`, name, description, isLocal: true }
      setBands((prev) => {
        const next = [...prev, localBand]
        saveBandsLocal(next)
        return next
      })
      setActiveBandId(localBand.id)
      localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, localBand.id)
      showToast(`Сервер недоступен: создана локальная группа "${localBand.name}"`)
    } finally {
      setCreatingBand(false)
      setNewBandName('')
      setNewBandDescription('')
      setShowBandModal(false)
    }
  }

  const startEditBand = (band: Band): void => {
    setEditingBandId(band.id)
    setEditingBandName(band.name)
    setEditingBandDescription(band.description || '')
  }

  const saveBandMeta = async (): Promise<void> => {
    if (!editingBandId || !editingBandName.trim()) return
    const updatedName = editingBandName.trim()
    const updatedDescription = editingBandDescription.trim()
    const targetBand = bands.find((band) => band.id === editingBandId)
    if (!targetBand) return

    if (!targetBand.isLocal) {
      try {
        await pb.collection('bands').update(editingBandId, {
          name: updatedName,
          description: updatedDescription,
        })
      } catch {
        showToast('Не удалось обновить группу в облаке')
        return
      }
    }

    setBands((prev) => {
      const next = prev.map((band) =>
        band.id === editingBandId ? { ...band, name: updatedName, description: updatedDescription } : band,
      )
      saveBandsLocal(next)
      return next
    })
    setEditingBandId(null)
    setEditingBandName('')
    setEditingBandDescription('')
    showToast('Данные группы обновлены')
  }

  const loadInvitesForBand = async (bandId: string): Promise<void> => {
    setInvitesLoading(true)
    try {
      const records = await pb.collection('band_invites').getFullList()
      const mapped = records
        .filter((item) => {
          const bandField = item.band as string | string[] | undefined
          const invitedBy = Array.isArray(item.invitedBy) ? item.invitedBy[0] : (item.invitedBy as string | undefined)
          const matchesBand = Array.isArray(bandField) ? bandField.includes(bandId) : bandField === bandId
          return matchesBand && invitedBy === userId
        })
        .map((item) => ({
        id: item.id,
        token: (item.token as string) ?? '',
        isActive: Boolean(item.isActive),
        expiresAt: (item.expiresAt as string) ?? '',
        }))
      setBandInvites(mapped)
    } catch {
      setBandInvites([])
      showToast('Не удалось загрузить список приглашений')
    } finally {
      setInvitesLoading(false)
    }
  }

  const loadMembersForBand = async (bandId: string): Promise<void> => {
    setMembersLoading(true)
    try {
      const memberships = await pb.collection('band_members').getFullList({
        filter: `band="${bandId}"`,
        expand: 'user',
      })
      const mapped = memberships.map((item) => {
        const expandedUser = item.expand?.user
        const userId = Array.isArray(item.user) ? item.user[0] : ((item.user as string | undefined) ?? '')
        const snapshotName = ((item.memberName as string) ?? '').trim()
        const snapshotEmail = ((item.memberEmail as string) ?? '').trim()
        const snapshotInstrument = ((item.memberInstrument as string) ?? '').trim()
        const snapshotAvatarUrl = ((item.memberAvatarUrl as string) ?? '').trim()
        let email = snapshotEmail || userId
        let name = snapshotName
        let avatarUrl = snapshotAvatarUrl
        let instrument = snapshotInstrument
        if (expandedUser && !Array.isArray(expandedUser)) {
          email = snapshotEmail || ((expandedUser.email as string) ?? userId)
          name = snapshotName || ((expandedUser.name as string) ?? '')
          instrument = snapshotInstrument || ((expandedUser.instrument as string) ?? '')
          if (!avatarUrl) {
            const avatarName = (expandedUser.avatar as string) ?? ''
            if (avatarName) avatarUrl = pb.files.getURL(expandedUser as never, avatarName)
          }
        }
        return {
          id: item.id,
          userId,
          email,
          name,
          avatarUrl,
          instrument,
          role: ((item.role as string) ?? 'member') || 'member',
        } as BandMember
      })
      setBandMembers(mapped)
      const activeBand = bands.find((band) => band.id === bandId)
      const isBandOwner = activeBand?.ownerId === userId
      const isOwnerByRole = memberships.some((item) => {
        const memberUserId = Array.isArray(item.user) ? item.user[0] : (item.user as string | undefined)
        return memberUserId === userId && ((item.role as string) ?? '') === 'owner'
      })
      setCanManageMembers(Boolean(isBandOwner || isOwnerByRole))
    } catch {
      setBandMembers([])
      setCanManageMembers(false)
      showToast('Не удалось загрузить участников группы')
    } finally {
      setMembersLoading(false)
    }
  }

  const openInviteModalForBand = async (band: Band): Promise<void> => {
    if (band.isLocal) {
      showToast('Для локальной группы ссылки-приглашения недоступны')
      return
    }
    setInviteBand(band)
    setInviteLink('')
    setShowInviteModal(true)
    await loadInvitesForBand(band.id)
  }

  const createInviteForTargetBand = async (bandId: string): Promise<void> => {
    const tokenSource = `${Date.now()}-${Math.random()}-${bandId}-${userId ?? 'guest'}`
    const token = btoa(tokenSource).replace(/[^a-zA-Z0-9]/g, '').slice(0, 36)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    try {
      const created = await pb.collection('band_invites').create({
        band: bandId,
        token,
        invitedBy: userId,
        isActive: true,
        expiresAt,
      })
      const link = `${window.location.origin}/invite/${token}`
      setInviteLink(link)
      setBandInvites((prev) => [
        { id: created.id, token, isActive: true, expiresAt },
        ...prev.filter((invite) => invite.id !== created.id),
      ])
      await loadInvitesForBand(bandId)
      showToast('Ссылка приглашения создана (24 часа)')
    } catch (error) {
      const details = error instanceof Error ? error.message : 'ошибка сервера'
      showToast(`Не удалось создать ссылку: ${details}`)
    }
  }

  const getCurrentMemberSnapshot = (): {
    memberName: string
    memberEmail: string
    memberInstrument: string
    memberAvatarUrl: string
  } => {
    const record = pb.authStore.record as {
      id?: string
      collectionId?: string
      name?: string
      email?: string
      instrument?: string
      avatar?: string
    } | null
    const avatarUrl =
      record?.avatar && record?.id && record?.collectionId
        ? pb.files.getURL(record as never, record.avatar)
        : ''
    return {
      memberName: (record?.name ?? '').trim(),
      memberEmail: (record?.email ?? userEmail ?? '').trim(),
      memberInstrument: (record?.instrument ?? '').trim(),
      memberAvatarUrl: avatarUrl,
    }
  }

  const createInviteForBand = async (): Promise<void> => {
    if (!inviteBand || inviteBand.isLocal) return
    await createInviteForTargetBand(inviteBand.id)
  }

  const getInvitesBandId = (): string | null => {
    if (inviteBand?.id) return inviteBand.id
    if (routeBandId) return routeBandId
    if (activeBandId) return activeBandId
    return null
  }

  const deactivateInvite = async (inviteId: string): Promise<void> => {
    const targetBandId = getInvitesBandId()
    if (!targetBandId) {
      showToast('Не определена группа для инвайта')
      return
    }
    const invite = bandInvites.find((item) => item.id === inviteId)
    if (!invite) {
      showToast('Инвайт не найден или недоступен')
      return
    }
    try {
      await pb.collection('band_invites').update(inviteId, {
        isActive: false,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      })
      setBandInvites((prev) =>
        prev.map((invite) =>
          invite.id === inviteId
            ? { ...invite, isActive: false, expiresAt: new Date(Date.now() - 60 * 1000).toISOString() }
            : invite,
        ),
      )
      await loadInvitesForBand(targetBandId)
      showToast('Приглашение деактивировано')
    } catch (error) {
      const details = error instanceof Error ? error.message : 'ошибка сервера'
      showToast(`Не удалось деактивировать: ${details}`)
    }
  }

  const copyInviteLink = async (): Promise<void> => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      showToast('Ссылка скопирована')
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = inviteLink
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(textarea)
        showToast(copied ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку')
      } catch {
        showToast('Не удалось скопировать ссылку')
      }
    }
  }

  const copyInviteByToken = async (token: string): Promise<void> => {
    const link = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(link)
      setInviteLink(link)
      showToast('Ссылка скопирована')
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = link
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (copied) {
          setInviteLink(link)
          showToast('Ссылка скопирована')
        } else {
          showToast('Не удалось скопировать ссылку')
        }
      } catch {
        showToast('Не удалось скопировать ссылку')
      }
    }
  }

  const kickMemberFromBand = async (membershipId: string, memberUserId: string): Promise<void> => {
    if (!routeBandId || !canManageMembers) return
    if (memberUserId === userId) {
      showToast('Нельзя удалить самого себя из группы через кик')
      return
    }
    try {
      await pb.collection('band_members').delete(membershipId)
      await loadMembersForBand(routeBandId)
      showToast('Участник удален из группы')
    } catch {
      showToast('Не удалось удалить участника')
    }
  }

  useEffect(() => {
    const loadCurrentUserProfile = async (): Promise<void> => {
      if (!userId) return
      try {
        const userRecord = await pb.collection('users').getOne(userId)
        setCurrentUserName((userRecord.name as string) ?? '')
        const avatarName = (userRecord.avatar as string) ?? ''
        if (avatarName) {
          setCurrentUserAvatarUrl(pb.files.getURL(userRecord as never, avatarName))
        } else {
          setCurrentUserAvatarUrl('')
        }
      } catch {
        setCurrentUserName('')
        setCurrentUserAvatarUrl('')
      }
    }
    void loadCurrentUserProfile()
  }, [userId])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.topbarProfileMenu')) return
      setProfileMenuOpen(false)
      if (!target.closest('.topbarNavPanel') && !target.closest('.topbarBurger')) {
        setMobileHeaderOpen(false)
      }
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  useEffect(() => {
    if (!routeBandId) return
    if (!bands.some((band) => band.id === routeBandId)) return
    setActiveBandId(routeBandId)
    localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, routeBandId)
    void loadInvitesForBand(routeBandId)
    void loadMembersForBand(routeBandId)
  }, [routeBandId, bands])

  useEffect(() => {
    void loadBands()
  }, [userId])

  useEffect(() => {
    if (!activeBandId) return
    void loadBandData(activeBandId)
  }, [activeBandId])

  useEffect(() => {
    if (!activeBandId || !bandDataRecordId || !bandDataReadyRef.current) return
    if (saveBandDataTimeoutRef.current) window.clearTimeout(saveBandDataTimeoutRef.current)
    saveBandDataTimeoutRef.current = window.setTimeout(() => {
      const payload: BandDataPayload = { tracks, setlists, nextTrackId, nextSetlistId }
      saveBandDataLocal(activeBandId, payload)
      void pb.collection('band_data').update(bandDataRecordId, { payload }).catch(() => {
        // Keep local fallback silently; no blocking on remote save.
      })
    }, 300)
  }, [activeBandId, bandDataRecordId, tracks, setlists, nextTrackId, nextSetlistId])

  useEffect(() => {
    if (!activeBandId || bandDataRecordId) return
    const payload: BandDataPayload = { tracks, setlists, nextTrackId, nextSetlistId }
    saveBandDataLocal(activeBandId, payload)
  }, [activeBandId, bandDataRecordId, tracks, setlists, nextTrackId, nextSetlistId])

  useEffect(() => {
    const handleVisibility = (): void => {
      if (!wakeLockEnabled || !isPlayingRef.current) return
      if (document.visibilityState === 'visible') {
        void acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [wakeLockEnabled, wakeLockSupported])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const ctx = audioCtxRef.current
      if (!ctx || !isPlayingRef.current || recoveringAudioRef.current) return
      if (ctx.state === 'suspended') {
        recoveringAudioRef.current = true
        void ctx
          .resume()
          .then(() => startScheduler())
          .finally(() => {
            recoveringAudioRef.current = false
          })
      }
    }, 1500)
    return () => window.clearInterval(interval)
  }, [bpm, beatsPerBar, clickPreset, volume])

  const handleTapTempo = (): void => {
    const now = Date.now()
    const recent = [...tapTimesRef.current, now].slice(-8)
    tapTimesRef.current = recent
    if (recent.length < 2) return
    const diffs = recent.slice(1).map((t, i) => t - recent[i])
    const avg = diffs.reduce((sum, n) => sum + n, 0) / diffs.length
    setBpmSafe(60000 / avg)
  }
  const handleSelectTrack = (track: Track): void => {
    setSelectedTrackId(track.id)
    setBpmSafe(track.bpm)
    setBeatsPerBar(signatureToBeats(track.sig))
    setDivision(Number(track.sig.split('/')[1]) || 4)
  }
  const navigateTrack = (direction: -1 | 1): void => {
    if (selectedTrackIndex < 0) return
    const next = sourceTracks[selectedTrackIndex + direction]
    if (next) handleSelectTrack(next)
  }

  const requestDeleteTrack = (id: number): void => {
    const track = tracks.find((t) => t.id === id)
    if (!track) return
    setTrackToDelete(track)
  }
  const confirmDeleteTrack = (): void => {
    if (!trackToDelete) return
    const id = trackToDelete.id
    const deletedName = trackToDelete.name
    setTracks((prev) => prev.filter((t) => t.id !== id))
    setSetlists((prev) => prev.map((s) => ({ ...s, tracks: s.tracks.filter((tid) => tid !== id) })))
    if (selectedTrackId === id) setSelectedTrackId(null)
    setTrackToDelete(null)
    showToast(`Трек "${deletedName}" удален`)
  }
  const createTrack = (): void => {
    if (!newTrack.name.trim()) return
    const trackName = newTrack.name.trim()
    if (editingTrackId !== null) {
      setTracks((prev) =>
        prev.map((track) =>
          track.id === editingTrackId
            ? { ...track, ...newTrack, name: newTrack.name.trim(), bpm: clampBpm(newTrack.bpm) }
            : track,
        ),
      )
      setEditingTrackId(null)
      showToast(`Трек "${trackName}" обновлен`)
    } else {
      setTracks((prev) => [
        ...prev,
        { id: nextTrackId, ...newTrack, name: newTrack.name.trim(), bpm: clampBpm(newTrack.bpm) },
      ])
      setNextTrackId((prev) => prev + 1)
      showToast(`Трек "${trackName}" добавлен`)
    }
    setNewTrack({ name: '', bpm: 120, sig: '4/4', notes: '', sheet: '' })
    setShowTrackModal(false)
  }
  const openCreateTrackModal = (): void => {
    setEditingTrackId(null)
    setNewTrack({ name: '', bpm: 120, sig: '4/4', notes: '', sheet: '' })
    setShowTrackModal(true)
  }
  const openEditTrackModal = (track: Track): void => {
    setEditingTrackId(track.id)
    setNewTrack({ name: track.name, bpm: track.bpm, sig: track.sig, notes: track.notes, sheet: track.sheet ?? '' })
    setShowTrackModal(true)
  }
  const openTrackRoute = (trackId: number, options?: { fromSetlistId?: number }): void => {
    if (options?.fromSetlistId) {
      navigate(`/app/tracks/${trackId}?from=setlist&setlistId=${options.fromSetlistId}`)
      return
    }
    navigate(`/app/tracks/${trackId}?from=tracks`)
  }
  const createSetlist = (): void => {
    if (!newSetlistName.trim()) return
    const setlistName = newSetlistName.trim()
    setSetlists((prev) => [...prev, { id: nextSetlistId, name: setlistName, tracks: newSetlistTrackIds }])
    setNextSetlistId((prev) => prev + 1)
    setNewSetlistName('')
    setNewSetlistTrackIds([])
    setShowSetlistModal(false)
    showToast(`Сет-лист "${setlistName}" создан`)
  }
  const openSetlistTracksEditor = (setlistId: number): void => {
    const setlist = setlists.find((s) => s.id === setlistId)
    if (!setlist) return
    setSetlistTracksEditor(setlist)
    setEditingSetlistTrackIds(setlist.tracks)
  }
  const saveSetlistTracks = (): void => {
    if (!setlistTracksEditor) return
    const setlistName = setlistTracksEditor.name
    setSetlists((prev) =>
      prev.map((s) =>
        s.id === setlistTracksEditor.id
          ? {
              ...s,
              tracks: editingSetlistTrackIds,
            }
          : s,
      ),
    )
    setSetlistTracksEditor(null)
    showToast(`Состав "${setlistName}" обновлен`)
  }
  const reorderSetlistTrack = (setlistId: number, fromIndex: number, toIndex: number): void => {
    setSetlists((prev) =>
      prev.map((s) => {
        if (s.id !== setlistId) return s
        const arr = [...s.tracks]
        const [moved] = arr.splice(fromIndex, 1)
        if (typeof moved !== 'number') return s
        arr.splice(toIndex, 0, moved)
        return { ...s, tracks: arr }
      }),
    )
  }
  const openRenameSetlist = (setlistId: number): void => {
    const current = setlists.find((s) => s.id === setlistId)
    if (!current) return
    setSetlistToRename(current)
    setRenameSetlistValue(current.name)
  }
  const applyRenameSetlist = (): void => {
    if (!setlistToRename || !renameSetlistValue.trim()) return
    const nextName = renameSetlistValue.trim()
    setSetlists((prev) =>
      prev.map((s) => (s.id === setlistToRename.id ? { ...s, name: nextName } : s)),
    )
    setSetlistToRename(null)
    setRenameSetlistValue('')
    showToast(`Сет-лист переименован в "${nextName}"`)
  }
  const requestDeleteSetlist = (setlistId: number): void => {
    const current = setlists.find((s) => s.id === setlistId)
    if (!current) return
    setSetlistToDelete(current)
  }
  const confirmDeleteSetlist = (): void => {
    if (!setlistToDelete) return
    const id = setlistToDelete.id
    const deletedName = setlistToDelete.name
    setSetlists((prev) => prev.filter((s) => s.id !== id))
    if (activeSetlistId === id) setActiveSetlistId(null)
    setSetlistToDelete(null)
    showToast(`Сет-лист "${deletedName}" удален`)
  }

  const handleExport = (): void => {
    const data: PersistedData = { tracks, setlists, nextTrackId, nextSetlistId }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `clicktrack-export-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast('Экспорт выполнен')
  }
  const handleInstallApp = async (): Promise<void> => {
    if (!installPromptEvent) return
    await installPromptEvent.prompt()
    await installPromptEvent.userChoice
    setInstallPromptEvent(null)
  }
  const handleImportClick = (): void => fileInputRef.current?.click()
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as PersistedData
      if (!Array.isArray(parsed.tracks) || !Array.isArray(parsed.setlists)) throw new Error('invalid')
      setTracks(parsed.tracks.map((track) => normalizeTrack(track)))
      setSetlists(parsed.setlists)
      setNextTrackId(parsed.nextTrackId ?? parsed.tracks.length + 1)
      setNextSetlistId(parsed.nextSetlistId ?? parsed.setlists.length + 1)
      setSelectedTrackId(null)
      showToast('Импорт выполнен')
    } catch {
      window.alert('Не удалось импортировать JSON')
    } finally {
      event.target.value = ''
    }
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if (typing) return
      if (event.code === 'Space') {
        event.preventDefault()
        void handlePlayToggle()
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault()
        handleTapTempo()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setBpmSafe(bpm + 1)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setBpmSafe(bpm - 1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigateTrack(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigateTrack(-1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [bpm, sourceTracks, selectedTrackIndex, isPlaying])

  return (
    <div className="app">
      <header className="topbar">
        {isGroupPage ? (
          <div className="groupTopbarTitle">
            <div className="logo">CLICK<span>TRACK</span></div>
            <div className="muted">Страница группы</div>
          </div>
        ) : (
          <div className="brandBlock">
            <div className="logoRow">
              <div className="logo">CLICK<span>TRACK</span></div>
              <div className={`pwaIndicator ${isOnline ? 'online' : 'offline'}`}>
                <span className="pwaDot" />
                <span>{isOnline ? 'Online' : 'Offline'}</span>
                <span className="pwaMode">{isStandalone ? 'PWA' : 'Web'}</span>
              </div>
            </div>
            <div className="bandRow">
              <CustomSelect
                className="bandPicker"
                value={activeBandId ?? ''}
                options={bands.map((band) => ({ value: band.id, label: band.name }))}
                onChange={(nextBandId) => {
                  setActiveBandId(nextBandId)
                  setSelectedTrackId(null)
                  localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, nextBandId)
                }}
                placeholder="Группа"
              />
              <button className="ghost bandAddBtn" onClick={() => setTab('groups')} title="Управление группами">
                +
              </button>
            </div>
          </div>
        )}
        {!isGroupPage && !isTrackPage && (
          <>
            <button
              className="ghost topbarBurger"
              onClick={() => setMobileHeaderOpen((prev) => !prev)}
              aria-label="Открыть меню"
              title="Меню"
            >
              ☰
            </button>
            <div className={`topbarNavPanel ${mobileHeaderOpen ? 'open' : ''}`}>
              <div className="tabs">
                <button className={`tab ${tab === 'metro' ? 'active' : ''}`} onClick={() => { setTab('metro'); setMobileHeaderOpen(false) }}>Метроном</button>
                <button className={`tab ${tab === 'tracks' ? 'active' : ''}`} onClick={() => { setTab('tracks'); setMobileHeaderOpen(false) }}>Треки</button>
                <button className={`tab ${tab === 'setlists' ? 'active' : ''}`} onClick={() => { setTab('setlists'); setMobileHeaderOpen(false) }}>Сет-листы</button>
                <button className={`tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => { setTab('groups'); setMobileHeaderOpen(false) }}>Группы</button>
              </div>
              <div className="tools">
                <div className="topbarProfileMenu">
                  <button
                    className="topbarProfileBadge"
                    onClick={(e) => {
                      e.stopPropagation()
                      setProfileMenuOpen((prev) => !prev)
                    }}
                    title="Меню профиля"
                    aria-label="Меню профиля"
                  >
                    {currentUserAvatarUrl ? (
                      <img src={currentUserAvatarUrl} alt="" className="topbarAvatar" />
                    ) : (
                      <div className="topbarAvatarFallback">{(currentUserName || userId || '?').slice(0, 1).toUpperCase()}</div>
                    )}
                    <span>{currentUserName.trim() || 'Профиль'}</span>
                    <span className={`profileChevron ${profileMenuOpen ? 'open' : ''}`}>▾</span>
                  </button>
                  {profileMenuOpen && (
                    <div className="topbarProfileDropdown">
                      <button
                        className="ghost"
                        onClick={() => {
                          setProfileMenuOpen(false)
                          setMobileHeaderOpen(false)
                          navigate('/profile')
                        }}
                      >
                        Профиль
                      </button>
                      <button
                        className="ghost"
                        onClick={() => {
                          setProfileMenuOpen(false)
                          setMobileHeaderOpen(false)
                          void signOut()
                        }}
                      >
                        Выход
                      </button>
                    </div>
                  )}
                </div>
                {installPromptEvent && (
                  <button
                    className="ghost iconOnly"
                    onClick={() => void handleInstallApp()}
                    title="Установить приложение"
                    aria-label="Установить приложение"
                  >
                    ⬚
                  </button>
                )}
                <button
                  className={`ghost iconOnly ${wakeLockEnabled ? 'activeState' : ''}`}
                  onClick={() => setWakeLockEnabled((prev) => !prev)}
                  title="Не давать экрану засыпать"
                  aria-label="Не давать экрану засыпать"
                  disabled={!wakeLockSupported}
                >
                  ☀
                </button>
              </div>
            </div>
          </>
        )}
      </header>

      {isGroupPage && !isTrackPage && (
        <GroupPageContainer
          band={bands.find((band) => band.id === routeBandId) ?? null}
          members={bandMembers}
          membersLoading={membersLoading}
          invites={bandInvites}
          invitesLoading={invitesLoading}
          tracksCount={tracks.length}
          setlistsCount={setlists.length}
          onBackToGroups={() => {
            navigate('/app')
            setTab('groups')
          }}
          onCreateInvite={() => {
            if (!routeBandId) return
            void createInviteForTargetBand(routeBandId)
          }}
          onRefreshInvites={() => {
            if (!routeBandId) return
            void loadInvitesForBand(routeBandId)
          }}
          canManageMembers={canManageMembers}
          currentUserId={userId}
          onKickMember={(membershipId, memberUserId) => void kickMemberFromBand(membershipId, memberUserId)}
          onCopyInvite={(token) => void copyInviteByToken(token)}
          onDeactivateInvite={(inviteId) => void deactivateInvite(inviteId)}
        />
      )}

      {isTrackPage && (
        <section className="singleColumn trackPage">
          <div className="titleRow">
            <h2>{routeTrack?.name ?? 'Трек не найден'}</h2>
            <button
              className="ghost"
              onClick={() => {
                if (trackPageContext.fromSetlist && trackPageContext.setlistId !== null) {
                  setTab('setlists')
                  setActiveSetlistId(trackPageContext.setlistId)
                  navigate('/app')
                  return
                }
                setTab('tracks')
                navigate('/app')
              }}
            >
              {trackPageContext.fromSetlist ? 'Назад к сет листу' : 'К списку треков'}
            </button>
          </div>
          {routeTrack ? (
            <>
              {trackPageContext.fromSetlist && (
                <div className="trackNavRow">
                  <button
                    className="ghost"
                    disabled={!trackPageSetlistNavigation.previous}
                    onClick={() => {
                      const previous = trackPageSetlistNavigation.previous
                      if (!previous || trackPageContext.setlistId === null) return
                      navigate(`/app/tracks/${previous.id}?from=setlist&setlistId=${trackPageContext.setlistId}`)
                    }}
                  >
                    {trackPageSetlistNavigation.previous
                      ? `Предыдущий ${trackPageSetlistNavigation.previous.name}`
                      : 'Предыдущий'}
                  </button>
                  <button
                    className="ghost"
                    disabled={!trackPageSetlistNavigation.next}
                    onClick={() => {
                      const next = trackPageSetlistNavigation.next
                      if (!next || trackPageContext.setlistId === null) return
                      navigate(`/app/tracks/${next.id}?from=setlist&setlistId=${trackPageContext.setlistId}`)
                    }}
                  >
                    {trackPageSetlistNavigation.next
                      ? `Следующий ${trackPageSetlistNavigation.next.name}`
                      : 'Следующий'}
                  </button>
                </div>
              )}
              <div className="muted trackMeta">
                {routeTrack.sig} · {routeTrack.bpm} BPM
                {routeTrack.notes ? ` · ${routeTrack.notes}` : ''}
              </div>
              <article className="trackSheetCard">
                <div className="trackSheetScroll">
                  <pre>{routeTrack.sheet?.trim() ? routeTrack.sheet : 'Материал трека пока не заполнен.'}</pre>
                </div>
              </article>
            </>
          ) : (
            <div className="empty">Трек не найден в текущей группе</div>
          )}
        </section>
      )}

      {!isGroupPage && !isTrackPage && tab === 'metro' && (
        <main className="layout">
          <aside className="sidebar">
            <div className="inlineControls">
              <span className="muted">Громкость</span>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
              />
              <strong>{Math.round(volume * 100)}%</strong>
            </div>
            <div className="inlineControls">
              <span className="muted">Звук</span>
              <CustomSelect
                value={clickPreset}
                options={[
                  { value: 'beep', label: 'Beep' },
                  { value: 'wood', label: 'Wood' },
                  { value: 'rim', label: 'Rim' },
                ]}
                onChange={(v) => setClickPreset(v as ClickPreset)}
              />
            </div>
            <div className="bpmButtons">
              {[-10, 10, -1, 1].map((delta) => <button key={delta} onClick={() => setBpmSafe(bpm + delta)}>{delta > 0 ? '+' : ''}{delta}</button>)}
            </div>
            <div
              className="display tapDisplay"
              onClick={handleTapTempo}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleTapTempo()
                }
              }}
            >
              <div className="bpmNumber">{bpm}</div>
              <div className="muted">BPM</div>
              <div className="muted">Нажмите для TAP TEMPO</div>
              <div className="beatDots">
                {Array.from({ length: beatsPerBar }).map((_, i) => <span key={i} className={`dot ${i === currentBeat && isPlaying ? 'active' : ''}`} />)}
              </div>
            </div>
            <div className="inlineControls">
              <input type="range" min={20} max={280} value={bpm} onChange={(e) => setBpmSafe(Number(e.target.value))} />
              <strong>{bpm}</strong>
            </div>
            <div className="inlineControls">
              <CustomSelect
                value={String(beatsPerBar)}
                options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
                onChange={(v) => setBeatsPerBar(Number(v))}
              />
              <CustomSelect
                value={String(division)}
                options={[4, 8, 16].map((n) => ({ value: String(n), label: String(n) }))}
                onChange={(v) => setDivision(Number(v))}
              />
            </div>
            <button className={`play ${isPlaying ? 'stop' : ''}`} onClick={() => void handlePlayToggle()}>
              {isPlaying ? 'Стоп' : 'Старт'}
            </button>
            <div className="hotkeys muted">Space: старт, T: tap, ←/→: треки, ↑/↓: BPM</div>
          </aside>

          <section className="content">
            {selectedTrack && (
              <div className="nowPlaying">
                <div className="nowPlayingTitle">Сейчас играет</div>
                <div className="nowPlayingTrackRow">
                  <button disabled={selectedTrackIndex <= 0} onClick={() => navigateTrack(-1)}>◀</button>
                  <div className="nowPlayingCenter">
                    <div className="trackName">{selectedTrack.name}</div>
                    <div className="muted">{selectedTrack.sig} · {selectedTrack.notes} · {selectedTrack.bpm} BPM</div>
                  </div>
                  <button disabled={selectedTrackIndex < 0 || selectedTrackIndex >= sourceTracks.length - 1} onClick={() => navigateTrack(1)}>▶</button>
                </div>
              </div>
            )}
            <div className="sourceTabs">
              <button className={sourceMode === 'all' ? 'active' : ''} onClick={() => { setSourceMode('all'); setSelectedTrackId(null) }}>Все треки</button>
              <button className={sourceMode === 'setlist' ? 'active' : ''} onClick={() => { setSourceMode('setlist'); setSelectedTrackId(null) }}>Сет-лист</button>
            </div>
            {sourceMode === 'setlist' && (
              <CustomSelect
                className="picker"
                value={activeSetlistId === null ? '' : String(activeSetlistId)}
                options={setlists.map((setlist) => ({
                  value: String(setlist.id),
                  label: `${setlist.name} (${setlist.tracks.length} тр.)`,
                }))}
                onChange={(v) => setActiveSetlistId(Number(v))}
                placeholder="Выберите сет-лист"
              />
            )}
            <div className="list">
              {sourceTracks.map((track, index) => (
                <button key={track.id} className={`item ${track.id === selectedTrackId ? 'selected' : ''}`} onClick={() => handleSelectTrack(track)}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><div className="trackName">{track.name}</div><div className="muted">{track.sig} · {track.notes}</div></div>
                  <strong>{track.bpm}</strong>
                </button>
              ))}
              {!sourceTracks.length && <div className="empty">Нет треков в этом источнике</div>}
            </div>
          </section>
        </main>
      )}

      {!isGroupPage && !isTrackPage && tab === 'tracks' && (
        <section className="singleColumn">
          <div className="titleRow">
            <h2>Все треки</h2>
            <div className="rowButtons">
              <button className="ghost iconOnly" onClick={handleExport} title="Экспорт" aria-label="Экспорт">
                <img src={exportIcon} alt="" />
              </button>
              <button className="ghost iconOnly" onClick={handleImportClick} title="Импорт" aria-label="Импорт">
                <img src={importIcon} alt="" />
              </button>
              <button className="small" onClick={openCreateTrackModal}>+ Добавить трек</button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json" className="hiddenInput" onChange={handleImportFile} />
          <div className="list">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                className="item plain trackRowClickable"
                role="button"
                tabIndex={0}
                onClick={() => openTrackRoute(track.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openTrackRoute(track.id)
                  }
                }}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><div className="trackName">{track.name}</div><div className="muted">{track.sig} · {track.notes}</div></div>
                <strong>{track.bpm}</strong>
                <button className="ghost trackActionBtn" onClick={(e) => { e.stopPropagation(); openTrackRoute(track.id) }}>↗</button>
                <button className="ghost trackActionBtn" onClick={(e) => { e.stopPropagation(); openEditTrackModal(track) }}>✎</button>
                <button className="danger trackActionBtn" onClick={(e) => { e.stopPropagation(); requestDeleteTrack(track.id) }}>✕</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isGroupPage && !isTrackPage && tab === 'setlists' && (
        <section className="singleColumn">
          <div className="titleRow"><h2>Сет-листы</h2><button className="small" onClick={() => setShowSetlistModal(true)}>+ Новый сет-лист</button></div>
          {setlists.map((setlist) => (
            <article key={setlist.id} className="setlistCard">
              <div className="titleRow compact">
                <h3>{setlist.name}</h3>
                <div className="rowButtons">
                  <span className="muted">{setlist.tracks.length} треков</span>
                  <button className="ghost iconOnly" onClick={() => openSetlistTracksEditor(setlist.id)} title="Треки" aria-label="Треки">
                    <img src={listIcon} alt="" />
                  </button>
                  <button className="ghost iconOnly" onClick={() => openRenameSetlist(setlist.id)} title="Переименовать" aria-label="Переименовать">
                    <img src={editIcon} alt="" />
                  </button>
                  <button className="danger iconOnly" onClick={() => requestDeleteSetlist(setlist.id)} title="Удалить сет-лист" aria-label="Удалить сет-лист">
                    <img src={deleteIcon} alt="" />
                  </button>
                </div>
              </div>
              {setlist.tracks.map((trackId, index) => {
                const track = tracks.find((t) => t.id === trackId)
                if (!track) return null
                return (
                  <div
                    key={track.id}
                    className={`setlistItem ${dragInfo?.setlistId === setlist.id && dragInfo.fromIndex === index ? 'dragging' : ''} ${selectedTrackId === track.id ? 'currentTrack' : ''}`}
                    draggable
                    role="button"
                    tabIndex={0}
                    onClick={() => openTrackRoute(track.id, { fromSetlistId: setlist.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openTrackRoute(track.id, { fromSetlistId: setlist.id })
                      }
                    }}
                    onDragStart={() => setDragInfo({ setlistId: setlist.id, fromIndex: index })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!dragInfo || dragInfo.setlistId !== setlist.id) return
                      reorderSetlistTrack(setlist.id, dragInfo.fromIndex, index)
                      setDragInfo(null)
                    }}
                    onDragEnd={() => setDragInfo(null)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <div className="trackName">
                        {track.name}
                        {selectedTrackId === track.id && <span className="playingBadge">Играет</span>}
                      </div>
                      <div className="muted">{track.sig}</div>
                    </div>
                    <strong>{track.bpm}</strong>
                    <div className="rowButtons">
                      <button className="setlistActionBtn" disabled={index === 0} onClick={(e) => { e.stopPropagation(); reorderSetlistTrack(setlist.id, index, index - 1) }}>↑</button>
                      <button className="setlistActionBtn" disabled={index === setlist.tracks.length - 1} onClick={(e) => { e.stopPropagation(); reorderSetlistTrack(setlist.id, index, index + 1) }}>↓</button>
                      <button
                        className="danger setlistActionBtn"
                        onClick={(e) => { e.stopPropagation(); setSetlistTrackToDelete({ setlistId: setlist.id, index, trackName: track.name }) }}
                        title="Удалить из сет-листа"
                        aria-label="Удалить из сет-листа"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </article>
          ))}
          {!setlists.length && <div className="empty">Нет сет-листов</div>}
        </section>
      )}

      {!isGroupPage && !isTrackPage && tab === 'groups' && (
        <section className="singleColumn">
          <div className="titleRow">
            <h2>Группы</h2>
            <button className="small" onClick={() => setShowBandModal(true)}>+ Новая группа</button>
          </div>

          <div className="list">
            {bands.map((band) => (
              <article key={band.id} className={`setlistCard ${activeBandId === band.id ? 'currentTrack' : ''}`}>
                {editingBandId === band.id ? (
                  <>
                    <div className="inlineControls" style={{ marginBottom: '0.45rem' }}>
                      <input value={editingBandName} onChange={(e) => setEditingBandName(e.target.value)} />
                    </div>
                    <div className="inlineControls" style={{ marginBottom: '0.55rem' }}>
                      <input
                        placeholder="Описание"
                        value={editingBandDescription}
                        onChange={(e) => setEditingBandDescription(e.target.value)}
                      />
                    </div>
                    <div className="rowButtons">
                      <button className="small" onClick={() => void saveBandMeta()}>Сохранить</button>
                      <button className="ghost" onClick={() => setEditingBandId(null)}>Отмена</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="titleRow compact">
                      <h3>{band.name}</h3>
                      <div className="rowButtons">
                        <button className="ghost trackActionBtn" onClick={() => startEditBand(band)} title="Редактировать" aria-label="Редактировать">
                          ✎
                        </button>
                        <button
                          className="ghost"
                          onClick={() => void openInviteModalForBand(band)}
                          disabled={Boolean(band.isLocal)}
                          title={band.isLocal ? 'Недоступно для локальной группы' : 'Пригласить по ссылке'}
                        >
                          Пригласить
                        </button>
                        <button
                          className="ghost"
                          onClick={() => {
                            setActiveBandId(band.id)
                            localStorage.setItem(ACTIVE_BAND_STORAGE_KEY, band.id)
                          }}
                        >
                          Выбрать
                        </button>
                        <button
                          className="ghost"
                          onClick={() => navigate(`/app/group/${band.id}`)}
                        >
                          Перейти
                        </button>
                      </div>
                    </div>
                    <div className="muted">{band.description || 'Без описания'}</div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {showBandModal && (
        <div className="modalOverlay" onClick={() => setShowBandModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Новая группа</h3>
            <label>
              Название группы
              <input value={newBandName} onChange={(e) => setNewBandName(e.target.value)} />
            </label>
            <label>
              Описание (опционально)
              <input value={newBandDescription} onChange={(e) => setNewBandDescription(e.target.value)} />
            </label>
            <div className="modalButtons">
              <button className="ghost" onClick={() => setShowBandModal(false)}>Отмена</button>
              <button className="small" onClick={() => void createBand()} disabled={creatingBand || !newBandName.trim()}>
                {creatingBand ? 'Создание...' : 'Создать группу'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="modalOverlay" onClick={() => { setShowInviteModal(false); setInviteBand(null) }}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Приглашения: {inviteBand?.name ?? 'группа'}</h3>
            <div className="rowButtons" style={{ marginBottom: '0.6rem' }}>
              <button className="small" onClick={() => void createInviteForBand()}>
                Создать ссылку (24ч)
              </button>
              <button className="ghost" onClick={() => inviteBand && void loadInvitesForBand(inviteBand.id)}>Обновить</button>
            </div>
            {!!inviteLink && (
              <label>
                Новая ссылка
                <input value={inviteLink} readOnly />
              </label>
            )}
            <div className="checkboxList" style={{ maxHeight: '180px', marginTop: '0.5rem' }}>
              {invitesLoading && <div className="muted">Загрузка...</div>}
              {!invitesLoading && bandInvites.length === 0 && <div className="muted">Пока нет созданных приглашений</div>}
              {!invitesLoading && bandInvites.map((invite) => {
                const expired = invite.expiresAt ? new Date(invite.expiresAt).getTime() <= Date.now() : false
                const status = !invite.isActive ? 'деактивировано' : expired ? 'истекло' : 'активно'
                const link = `${window.location.origin}/invite/${invite.token}`
                return (
                  <div key={invite.id} className="checkboxRow" style={{ alignItems: 'center' }}>
                    <span>{invite.token.slice(0, 8)}...</span>
                    <strong>{status}</strong>
                    <div className="rowButtons">
                      <button className="ghost" onClick={() => { setInviteLink(link); void navigator.clipboard.writeText(link).then(() => showToast('Ссылка скопирована')).catch(() => showToast('Не удалось скопировать ссылку')) }}>Копировать</button>
                      <button className="danger" onClick={() => void deactivateInvite(invite.id)} disabled={!invite.isActive}>Деактивировать</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="modalButtons">
              <button className="ghost" onClick={() => { setShowInviteModal(false); setInviteBand(null) }}>Закрыть</button>
              <button className="small" onClick={() => void copyInviteLink()}>Копировать</button>
            </div>
          </div>
        </div>
      )}

      {showTrackModal && (
        <div className="modalOverlay" onClick={() => { setShowTrackModal(false); setEditingTrackId(null) }}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTrackId !== null ? 'Редактировать трек' : 'Новый трек'}</h3>
            <label>Название<input value={newTrack.name} onChange={(e) => setNewTrack((p) => ({ ...p, name: e.target.value }))} /></label>
            <div className="inlineControls">
              <label>BPM<input type="number" min={20} max={280} value={newTrack.bpm} onChange={(e) => setNewTrack((p) => ({ ...p, bpm: Number(e.target.value) }))} /></label>
              <label>
                Размер
                <CustomSelect
                  value={newTrack.sig}
                  options={['4/4', '3/4', '6/8', '5/4', '7/8', '2/4'].map((sig) => ({ value: sig, label: sig }))}
                  onChange={(v) => setNewTrack((p) => ({ ...p, sig: v }))}
                />
              </label>
            </div>
            <label>Заметки<input value={newTrack.notes} onChange={(e) => setNewTrack((p) => ({ ...p, notes: e.target.value }))} /></label>
            <label>
              Материал трека (текст / аккорды / табы)
              <textarea
                rows={10}
                value={newTrack.sheet}
                onChange={(e) => setNewTrack((p) => ({ ...p, sheet: e.target.value }))}
                placeholder="[Куплет]&#10;Am ...&#10;&#10;[Таб]&#10;E|---..."
              />
            </label>
            <div className="modalButtons"><button className="ghost" onClick={() => { setShowTrackModal(false); setEditingTrackId(null) }}>Отмена</button><button className="small" onClick={createTrack}>Сохранить</button></div>
          </div>
        </div>
      )}

      {showSetlistModal && (
        <div className="modalOverlay" onClick={() => setShowSetlistModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Новый сет-лист</h3>
            <label>Название<input value={newSetlistName} onChange={(e) => setNewSetlistName(e.target.value)} /></label>
            <div className="modalQuickActions">
              <button className="ghost" onClick={() => setNewSetlistTrackIds(tracks.map((track) => track.id))}>Выбрать все</button>
              <button className="ghost" onClick={() => setNewSetlistTrackIds([])}>Снять все</button>
            </div>
            <div className="checkboxList">
              {tracks.map((track) => (
                <label key={track.id} className="checkboxRow">
                  <input type="checkbox" checked={newSetlistTrackIds.includes(track.id)} onChange={(e) => setNewSetlistTrackIds((prev) => e.target.checked ? [...prev, track.id] : prev.filter((id) => id !== track.id))} />
                  <span>{track.name}</span>
                  <strong>{track.bpm}</strong>
                </label>
              ))}
            </div>
            <div className="modalButtons"><button className="ghost" onClick={() => setShowSetlistModal(false)}>Отмена</button><button className="small" onClick={createSetlist}>Создать</button></div>
          </div>
        </div>
      )}

      {setlistTracksEditor && (
        <div className="modalOverlay" onClick={() => setSetlistTracksEditor(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Треки сет-листа: {setlistTracksEditor.name}</h3>
            <div className="modalQuickActions">
              <button className="ghost" onClick={() => setEditingSetlistTrackIds(tracks.map((track) => track.id))}>Выбрать все</button>
              <button className="ghost" onClick={() => setEditingSetlistTrackIds([])}>Снять все</button>
            </div>
            <div className="checkboxList">
              {tracks.map((track) => (
                <label key={track.id} className="checkboxRow">
                  <input
                    type="checkbox"
                    checked={editingSetlistTrackIds.includes(track.id)}
                    onChange={(e) =>
                      setEditingSetlistTrackIds((prev) =>
                        e.target.checked ? [...prev, track.id] : prev.filter((id) => id !== track.id),
                      )
                    }
                  />
                  <span>{track.name}</span>
                  <strong>{track.bpm}</strong>
                </label>
              ))}
            </div>
            <div className="modalButtons">
              <button className="ghost" onClick={() => setSetlistTracksEditor(null)}>Отмена</button>
              <button className="small" onClick={saveSetlistTracks}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {trackToDelete && (
        <div className="modalOverlay" onClick={() => setTrackToDelete(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить трек?</h3>
            <p className="muted">"{trackToDelete.name}" будет удален из всех сет-листов.</p>
            <div className="modalButtons">
              <button className="ghost" onClick={() => setTrackToDelete(null)}>Отмена</button>
              <button className="danger" onClick={confirmDeleteTrack}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {setlistToDelete && (
        <div className="modalOverlay" onClick={() => setSetlistToDelete(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить сет-лист?</h3>
            <p className="muted">"{setlistToDelete.name}" будет удален без возможности восстановления.</p>
            <div className="modalButtons">
              <button className="ghost" onClick={() => setSetlistToDelete(null)}>Отмена</button>
              <button className="danger" onClick={confirmDeleteSetlist}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {setlistTrackToDelete && (
        <div className="modalOverlay" onClick={() => setSetlistTrackToDelete(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить трек из сет-листа?</h3>
            <p className="muted">"{setlistTrackToDelete.trackName}" будет удален только из этого сет-листа.</p>
            <div className="modalButtons">
              <button className="ghost" onClick={() => setSetlistTrackToDelete(null)}>Отмена</button>
              <button
                className="danger"
                onClick={() => {
                  setSetlists((prev) =>
                    prev.map((s) =>
                      s.id === setlistTrackToDelete.setlistId
                        ? { ...s, tracks: s.tracks.filter((_, i) => i !== setlistTrackToDelete.index) }
                        : s,
                    ),
                  )
                  showToast(`"${setlistTrackToDelete.trackName}" удален из сет-листа`)
                  setSetlistTrackToDelete(null)
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {setlistToRename && (
        <div className="modalOverlay" onClick={() => setSetlistToRename(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Переименовать сет-лист</h3>
            <label>
              Новое название
              <input value={renameSetlistValue} onChange={(e) => setRenameSetlistValue(e.target.value)} />
            </label>
            <div className="modalButtons">
              <button className="ghost" onClick={() => setSetlistToRename(null)}>Отмена</button>
              <button className="small" onClick={applyRenameSetlist}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  )
}

export default App
