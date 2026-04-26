import { useState } from 'react'

type Band = { id: string; name: string; description: string; isLocal?: boolean }
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
type GroupTab = 'members' | 'invites' | 'data'

type GroupPageContainerProps = {
  band: Band | null
  members: BandMember[]
  membersLoading: boolean
  invites: BandInvite[]
  invitesLoading: boolean
  tracksCount: number
  setlistsCount: number
  onBackToGroups: () => void
  onCreateInvite: () => void
  onRefreshInvites: () => void
  canManageMembers: boolean
  currentUserId: string | null
  onKickMember: (membershipId: string, memberUserId: string) => void
  onCopyInvite: (token: string) => void
  onDeactivateInvite: (inviteId: string) => void
}

export function GroupPageContainer({
  band,
  members,
  membersLoading,
  invites,
  invitesLoading,
  tracksCount,
  setlistsCount,
  onBackToGroups,
  onCreateInvite,
  onRefreshInvites,
  canManageMembers,
  currentUserId,
  onKickMember,
  onCopyInvite,
  onDeactivateInvite,
}: GroupPageContainerProps) {
  const [activeTab, setActiveTab] = useState<GroupTab>('members')

  return (
    <section className="singleColumn" style={{ marginTop: '0.3rem', marginBottom: '0.5rem' }}>
      <div className="titleRow">
        <h2>Страница группы: {band?.name ?? '...'}</h2>
        <button className="ghost" onClick={onBackToGroups}>
          К списку групп
        </button>
      </div>
      <div className="muted" style={{ marginBottom: '0.6rem' }}>
        {band?.description || 'Описание группы пока не заполнено'}
      </div>

      <div className="tabs groupPageTabs">
        <button className={`tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
          Участники
        </button>
        <button className={`tab ${activeTab === 'invites' ? 'active' : ''}`} onClick={() => setActiveTab('invites')}>
          Инвайты
        </button>
        <button className={`tab ${activeTab === 'data' ? 'active' : ''}`} onClick={() => setActiveTab('data')}>
          Данные группы
        </button>
      </div>

      {activeTab === 'members' && (
        <article className="setlistCard">
          <div className="titleRow compact">
            <h3>Участники</h3>
            <strong>{members.length}</strong>
          </div>
          {membersLoading && <div className="muted">Загрузка участников...</div>}
          {!membersLoading && members.length === 0 && <div className="muted">Пока нет участников</div>}
          {!membersLoading &&
            members.map((member) => (
              <div key={member.id} className="groupMemberRow">
                <div className="groupMemberHead">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="groupMemberAvatar" />
                  ) : (
                    <div className="groupMemberAvatarFallback">
                      {(member.name?.trim() || member.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="groupMemberMain">{member.name?.trim() || member.email}</div>
                    {member.name?.trim() && <div className="groupMemberSub">{member.email}</div>}
                    {!!member.instrument?.trim() && <div className="groupMemberInstrument">{member.instrument}</div>}
                  </div>
                </div>
                {canManageMembers && member.userId !== currentUserId && (
                  <div className="groupMemberActions">
                    <button className="danger" onClick={() => onKickMember(member.id, member.userId)}>
                      Кикнуть
                    </button>
                  </div>
                )}
              </div>
            ))}
        </article>
      )}

      {activeTab === 'invites' && (
        <article className="setlistCard">
          <div className="titleRow compact">
            <h3>Инвайты</h3>
            <div className="rowButtons">
              <button className="small" onClick={onCreateInvite}>
                Создать (24ч)
              </button>
              <button className="ghost" onClick={onRefreshInvites}>
                Обновить
              </button>
            </div>
          </div>
          {invitesLoading && <div className="muted">Загрузка приглашений...</div>}
          {!invitesLoading && invites.length === 0 && <div className="muted">Пока нет приглашений</div>}
          {!invitesLoading &&
            invites.map((invite) => {
              const expired = invite.expiresAt ? new Date(invite.expiresAt).getTime() <= Date.now() : false
              const isActive = invite.isActive && !expired
              const expiresText = invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : '—'
              return (
                <div key={invite.id} className="groupInviteCard">
                  <div className="groupInviteHeader">
                    <div className="groupInviteToken">{invite.token.slice(0, 16)}...</div>
                    <span className={`groupInviteStatus ${isActive ? 'isActive' : 'isInactive'}`}>
                      {isActive ? 'активен' : 'неактивен'}
                    </span>
                  </div>
                  <div className="groupInviteMeta">Действует до: {expiresText}</div>
                  <div className="rowButtons groupInviteActions">
                    <button className="ghost" onClick={() => onCopyInvite(invite.token)}>
                      Копировать
                    </button>
                    <button
                      className="danger"
                      onClick={() => onDeactivateInvite(invite.id)}
                      disabled={!isActive}
                    >
                      Деактивировать
                    </button>
                  </div>
                </div>
              )
            })}
        </article>
      )}

      {activeTab === 'data' && (
        <article className="setlistCard">
          <div className="titleRow compact">
            <h3>Данные группы</h3>
          </div>
          <div className="groupStatsGrid">
            <div className="groupStatCard">
              <div className="groupStatLabel">Треки</div>
              <div className="groupStatValue">{tracksCount}</div>
            </div>
            <div className="groupStatCard">
              <div className="groupStatLabel">Сет-листы</div>
              <div className="groupStatValue">{setlistsCount}</div>
            </div>
          </div>
        </article>
      )}
    </section>
  )
}
