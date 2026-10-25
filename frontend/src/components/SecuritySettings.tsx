import React, { useState, useEffect } from 'react'
import {
  Users, UserPlus, Key, Eye, EyeOff, RefreshCw, Trash2, Pencil,
  Database, AlertCircle, CheckCircle2
} from 'lucide-react'
import { useToastStore } from '../store/toastStore'
import { useAuthStore } from '../store/authStore'
import { useTranslation } from '../i18n'
import type { User, UserRole } from '../types'

interface RetentionStats {
  retention_days: number
  total_records: number
  oldest_record: string | null
}

export function SecuritySettings() {
  const { t, isEn } = useTranslation()
  const currentUser = useAuthStore(s => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [retention, setRetention] = useState<RetentionStats | null>(null)
  const [retentionLoading, setRetentionLoading] = useState(true)
  const [purging, setPurging] = useState(false)

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('viewer')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('viewer')
  const [editError, setEditError] = useState<string | null>(null)

  const [resetPassUser, setResetPassUser] = useState<User | null>(null)
  const [newPassVal, setNewPassVal] = useState('')
  const [showResetPass, setShowResetPass] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null)

  useEffect(() => {
    loadUsers()
    loadRetention()
  }, [])

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(Array.isArray(data) ? data : [])
      }
    } catch {}
    setUsersLoading(false)
  }

  const loadRetention = async () => {
    setRetentionLoading(true)
    try {
      const res = await fetch('/api/system/retention')
      if (res.ok) {
        const data = await res.json()
        setRetention(data)
      }
    } catch {}
    setRetentionLoading(false)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!newUsername.trim()) {
      setCreateError(t.auth.userRequiredError)
      return
    }
    if (newPassword.length < 6) {
      setCreateError(t.auth.minPasswordError)
      return
    }

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error || 'Error creating user')
        return
      }

      useToastStore.getState().addToast({
        type: 'success',
        title: isEn ? 'User Created' : 'Usuario Creado',
        message: isEn
          ? `User ${data.username} (${data.role}) was created.`
          : `El usuario ${data.username} (${data.role}) fue creado con éxito.`
      })
      setShowCreateModal(false)
      setNewUsername('')
      setNewPassword('')
      setNewRole('viewer')
      loadUsers()
    } catch (err: any) {
      setCreateError(err.message || 'Error creating user')
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setEditError(null)

    if (!editUsername.trim()) {
      setEditError(t.auth.userRequiredError)
      return
    }

    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: editUsername.trim(),
          role: editRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error || 'Error updating user')
        return
      }

      useToastStore.getState().addToast({
        type: 'success',
        title: isEn ? 'User Updated' : 'Usuario Actualizado',
        message: isEn ? 'User details updated.' : 'Los datos del usuario fueron actualizados.'
      })
      setEditingUser(null)
      loadUsers()
    } catch (err: any) {
      setEditError(err.message || 'Error updating user')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPassUser) return
    setResetError(null)

    if (newPassVal.length < 6) {
      setResetError(t.auth.minPasswordError)
      return
    }

    try {
      const res = await fetch(`/api/users/${resetPassUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassVal }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResetError(data.error || 'Error updating password')
        return
      }

      useToastStore.getState().addToast({
        type: 'success',
        title: isEn ? 'Password Reset' : 'Contraseña Restablecida',
        message: isEn
          ? `Password for ${resetPassUser.username} was updated.`
          : `La contraseña de ${resetPassUser.username} fue actualizada.`
      })
      setResetPassUser(null)
      setNewPassVal('')
    } catch (err: any) {
      setResetError(err.message || 'Error updating password')
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return
    try {
      const res = await fetch(`/api/users/${deleteConfirmUser.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        useToastStore.getState().addToast({
          type: 'error',
          title: isEn ? 'Delete Error' : 'Error al eliminar',
          message: data.error || (isEn ? 'Could not delete user' : 'No se pudo eliminar el usuario')
        })
        setDeleteConfirmUser(null)
        return
      }

      useToastStore.getState().addToast({
        type: 'success',
        title: isEn ? 'User Deleted' : 'Usuario Eliminado',
        message: isEn
          ? `User ${deleteConfirmUser.username} was deleted.`
          : `El usuario ${deleteConfirmUser.username} fue eliminado.`
      })
      setDeleteConfirmUser(null)
      loadUsers()
    } catch {
      setDeleteConfirmUser(null)
    }
  }

  const handlePurgeHistory = async () => {
    setPurging(true)
    try {
      const res = await fetch('/api/system/retention/purge', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        useToastStore.getState().addToast({
          type: 'success',
          title: isEn ? 'History Purged' : 'Historial Optimizado',
          message: isEn
            ? `Purged ${data.purged_count} records older than 90 days.`
            : `Se depuraron ${data.purged_count} registros con más de 90 días.`
        })
        loadRetention()
      }
    } catch {}
    setPurging(false)
  }

  const getRoleBadge = (role: string) => {
    if (role === 'admin') {
      return (
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          background: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.35)',
          textTransform: 'uppercase', letterSpacing: '0.04em'
        }}>
          {isEn ? 'Admin (Full)' : 'Admin (Total)'}
        </span>
      )
    }
    if (role === 'helpdesk') {
      return (
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          background: 'rgba(14, 165, 233, 0.18)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.35)',
          textTransform: 'uppercase', letterSpacing: '0.04em'
        }}>
          {isEn ? 'Helpdesk (Ops & Shell)' : 'Helpdesk (Ops & Shell)'}
        </span>
      )
    }
    return (
      <span style={{
        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
        background: 'rgba(100, 116, 139, 0.18)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)',
        textTransform: 'uppercase', letterSpacing: '0.04em'
      }}>
        {isEn ? 'Viewer (Read-only)' : 'Viewer (Lectura)'}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* ── SECCIÓN 1: GESTIÓN DE USUARIOS & ROLES ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
              <Users size={18} color="var(--color-accent)" />
              {t.auth.usersTitle}
            </h3>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              {t.auth.usersSubtitle}
            </p>
          </div>
          <button
            onClick={() => {
              setNewUsername('')
              setNewPassword('')
              setNewRole('viewer')
              setCreateError(null)
              setShowCreateModal(true)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 34, padding: '0 14px', borderRadius: 8,
              background: 'var(--color-accent)', color: '#fff',
              fontSize: 12.5, fontWeight: 700, border: 'none',
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
            }}
          >
            <UserPlus size={14} /> {t.auth.newUserBtn}
          </button>
        </div>

        {/* Tabla de Usuarios */}
        <div style={{
          border: '1px solid var(--color-border)', borderRadius: 12,
          overflow: 'hidden', background: 'var(--color-bg-card)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                  {t.auth.usernameTh}
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                  {t.auth.roleTh}
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                  {t.auth.createdTh}
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em', textAlign: 'right' }}>
                  {t.auth.actionsTh}
                </th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {isEn ? 'Loading users...' : 'Cargando usuarios...'}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {isEn ? 'No users found.' : 'No se encontraron usuarios.'}
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const isCurrent = currentUser?.id === u.id
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: u.role === 'admin'
                              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                              : u.role === 'helpdesk'
                              ? 'linear-gradient(135deg, #0ea5e9, #2563eb)'
                              : 'linear-gradient(135deg, #64748b, #475569)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11.5, fontWeight: 700, color: '#fff',
                            textTransform: 'uppercase',
                          }}>
                            {u.username.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {u.username} {isCurrent && (
                              <span style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 700 }}>
                                {isEn ? '(You)' : '(Tú)'}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {getRoleBadge(u.role)}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {/* Editar Usuario */}
                          <button
                            onClick={() => {
                              setEditingUser(u)
                              setEditUsername(u.username)
                              setEditRole(u.role as UserRole)
                              setEditError(null)
                            }}
                            title={t.auth.editUserTitle}
                            style={{
                              padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600
                            }}
                          >
                            <Pencil size={12} /> {t.common.edit}
                          </button>

                          {/* Resetear Contraseña */}
                          <button
                            onClick={() => {
                              setResetPassUser(u)
                              setNewPassVal('')
                              setShowResetPass(false)
                              setResetError(null)
                            }}
                            title={t.auth.resetPassTitle}
                            style={{
                              padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600
                            }}
                          >
                            <Key size={12} /> {isEn ? 'Password' : 'Clave'}
                          </button>

                          {/* Eliminar Usuario */}
                          <button
                            onClick={() => setDeleteConfirmUser(u)}
                            disabled={isCurrent}
                            title={isCurrent ? (isEn ? 'Cannot delete your active account' : 'No puedes eliminar tu cuenta activa') : t.common.delete}
                            style={{
                              padding: '5px 8px', borderRadius: 6,
                              border: isCurrent ? '1px solid var(--color-border)' : '1px solid rgba(239, 68, 68, 0.3)',
                              background: isCurrent ? 'var(--color-bg-primary)' : 'rgba(239, 68, 68, 0.08)',
                              color: isCurrent ? 'var(--color-text-muted)' : '#ef4444',
                              cursor: isCurrent ? 'not-allowed' : 'pointer',
                              opacity: isCurrent ? 0.35 : 1,
                              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECCIÓN 2: RETENCIÓN DE HISTORIAL (90 DÍAS) ── */}
      <div>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
          <Database size={18} color="var(--color-accent)" />
          {t.auth.retentionTitle}
        </h3>
        <p style={{ margin: '0 0 14px 0', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
          {t.auth.retentionDesc}
        </p>

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '18px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {/* Política Activa */}
            <div style={{ padding: '12px 14px', background: 'var(--color-bg-primary)', borderRadius: 9, border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                {isEn ? 'Retention Policy' : 'Política de Retención'}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> 90 {isEn ? 'Days (Auto)' : 'Días (Auto)'}
              </div>
            </div>

            {/* Total Registros */}
            <div style={{ padding: '12px 14px', background: 'var(--color-bg-primary)', borderRadius: 9, border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                {t.auth.totalRecordsLabel}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {retentionLoading ? '...' : (retention?.total_records?.toLocaleString() ?? '—')}
              </div>
            </div>

            {/* Muestra más antigua */}
            <div style={{ padding: '12px 14px', background: 'var(--color-bg-primary)', borderRadius: 9, border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                {t.auth.oldestRecordLabel}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                {retentionLoading ? '...' : retention?.oldest_record ? new Date(retention.oldest_record).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              {isEn
                ? 'Automatic background cleaner runs every 6 hours to purge samples exceeding the 90-day threshold.'
                : 'El limpiador automático en segundo plano se ejecuta cada 6 horas para purgar muestras que superen los 90 días.'}
            </span>
            <button
              onClick={handlePurgeHistory}
              disabled={purging}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)',
                color: 'var(--color-accent)', fontSize: 12, fontWeight: 700,
                cursor: purging ? 'default' : 'pointer',
              }}
            >
              <RefreshCw size={13} style={{ animation: purging ? 'spin 1s linear infinite' : 'none' }} />
              {purging ? t.auth.purging : t.auth.purgeNowBtn}
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL: CREAR USUARIO ── */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 14, width: '100%', maxWidth: 420, padding: 24,
            boxShadow: '0 16px 40px rgba(0,0,0,0.25)'
          }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {t.auth.newUserBtn}
            </h4>

            {createError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14
              }}>
                <AlertCircle size={15} /> <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {t.auth.usernameLabel}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder={isEn ? "e.g. operator1" : "Ej: operador1"}
                  style={{
                    width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
                    border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {t.auth.roleTh}
                </label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as UserRole)}
                  style={{
                    width: '100%', height: 38, padding: '0 10px', borderRadius: 8,
                    border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                  }}
                >
                  <option value="viewer">{t.auth.userRoleViewer}</option>
                  <option value="helpdesk">{t.auth.userRoleHelpdesk}</option>
                  <option value="admin">{t.auth.userRoleAdmin}</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {t.auth.passwordLabel} (min 6 {isEn ? 'chars' : 'caracteres'})
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={isEn ? "Minimum 6 characters" : "Mínimo 6 caracteres"}
                    style={{
                      width: '100%', height: 38, padding: '0 36px 0 12px', borderRadius: 8,
                      border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                      color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR USUARIO ── */}
      {editingUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 14, width: '100%', maxWidth: 420, padding: 24,
            boxShadow: '0 16px 40px rgba(0,0,0,0.25)'
          }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {t.auth.editUserTitle}: {editingUser.username}
            </h4>

            {editError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14
              }}>
                <AlertCircle size={15} /> <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {t.auth.usernameLabel}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  style={{
                    width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
                    border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {t.auth.roleTh}
                </label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as UserRole)}
                  style={{
                    width: '100%', height: 38, padding: '0 10px', borderRadius: 8,
                    border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                  }}
                >
                  <option value="viewer">{t.auth.userRoleViewer}</option>
                  <option value="helpdesk">{t.auth.userRoleHelpdesk}</option>
                  <option value="admin">{t.auth.userRoleAdmin}</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RESETEAR CONTRASEÑA ── */}
      {resetPassUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 14, width: '100%', maxWidth: 400, padding: 24,
            boxShadow: '0 16px 40px rgba(0,0,0,0.25)'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {t.auth.resetPassTitle}
            </h4>
            <p style={{ margin: '0 0 16px 0', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              {isEn ? `Setting new credentials for ${resetPassUser.username}` : `Estableciendo nuevas credenciales para ${resetPassUser.username}`}
            </p>

            {resetError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14
              }}>
                <AlertCircle size={15} /> <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {t.auth.newPassLabel}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    autoFocus
                    value={newPassVal}
                    onChange={e => setNewPassVal(e.target.value)}
                    placeholder={isEn ? "Minimum 6 characters" : "Mínimo 6 caracteres"}
                    style={{
                      width: '100%', height: 38, padding: '0 36px 0 12px', borderRadius: 8,
                      border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                      color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass(v => !v)}
                    style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    {showResetPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setResetPassUser(null)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRMAR ELIMINACIÓN ── */}
      {deleteConfirmUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 14, width: '100%', maxWidth: 380, padding: 22,
            boxShadow: '0 16px 40px rgba(0,0,0,0.25)'
          }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={16} /> {isEn ? 'Delete User' : 'Eliminar Usuario'}
            </h4>
            <p style={{ margin: '0 0 18px 0', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              {isEn
                ? `Are you sure you want to delete user "${deleteConfirmUser.username}"? This action cannot be undone.`
                : `¿Estás seguro de que deseas eliminar al usuario "${deleteConfirmUser.username}"? Esta acción no se puede deshacer.`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
