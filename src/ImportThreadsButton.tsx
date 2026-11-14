import { useState } from 'react'
import { lookupPublicPost, publicationKey, threadsLink } from './threads'

export function ImportThreadsButton({ reactionField, disabled, onBusy }: {
  reactionField: 'likes' | 'reactions'
  disabled: boolean
  onBusy: (busy: boolean) => void
}) {
  const [status, setStatus] = useState('')

  return <>
    <button className="btn" type="button" disabled={disabled} onClick={async event => {
      const form = event.currentTarget.form
      const link = form?.elements.namedItem('url')
      if (!(link instanceof HTMLInputElement)) return
      const url = link.value.trim()
      if (!threadsLink(url) || !publicationKey(url).startsWith('threads:')) {
        setStatus('Colle un lien de publication ou de partage Threads valide.')
        return
      }

      onBusy(true)
      setStatus('Récupération en cours…')
      try {
        const post = await lookupPublicPost(url)
        const fields = [
          ['caption', post.caption, 'Légende'],
          ['author', post.author, 'Auteur'],
          [reactionField, post.likes, 'Réactions'],
          ...(reactionField === 'likes' ? [['comments', post.comments, 'Commentaires']] as const : []),
        ] as const
        const missing: string[] = []
        for (const [name, value, label] of fields) {
          const input = form?.elements.namedItem(name)
          if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) continue
          if (value == null || value === '') {
            missing.push(label)
            continue
          }
          const text = String(value)
          input.value = input.maxLength >= 0 ? text.slice(0, input.maxLength) : text
        }
        setStatus(missing.length === 0 ? 'Données importées.'
          : 'Champs à compléter si nécessaire : ' + missing.join(', ') + '.')
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'La récupération Threads a échoué.')
      } finally {
        onBusy(false)
      }
    }}>Récupérer les données du post</button>
    <p className="sub" role="status">{status}</p>
  </>
}
