import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, lead_id, ...payload } = body
    const supabase = getSupabase()

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })
    }

    // 1. Update lead fields (stage, priority, assigned_to, etc.)
    if (action === 'update_lead') {
      const { data, error } = await supabase
        .from('pipeline_leads')
        .update(payload.updates)
        .eq('id', lead_id)
        .select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, data })
    }

    // 2. Change stage with history
    if (action === 'change_stage') {
      const { new_stage, old_stage, changed_by } = payload
      // Insert history
      await supabase.from('pipeline_history').insert({
        lead_id, field_changed: 'stage',
        old_value: old_stage, new_value: new_stage,
        changed_by,
      })
      // Update lead
      const updates: Record<string, unknown> = { stage: new_stage }
      if (new_stage === '도입직전' || new_stage === '도입완료') {
        updates.converted_at = new Date().toISOString()
      }
      const { error } = await supabase.from('pipeline_leads').update(updates).eq('id', lead_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 3. Change assigned
    if (action === 'change_assigned') {
      const { user_id, old_name, new_name, changed_by } = payload
      await supabase.from('pipeline_history').insert({
        lead_id, field_changed: 'assigned_to',
        old_value: old_name, new_value: new_name,
        changed_by,
      })
      const { error } = await supabase.from('pipeline_leads')
        .update({ assigned_to: user_id || null })
        .eq('id', lead_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 4. Add activity log
    if (action === 'add_activity') {
      const { data, error } = await supabase.from('activity_logs')
        .insert({
          lead_id,
          activity_type: payload.activity_type,
          title: payload.title || null,
          description: payload.description || null,
          performed_by: payload.performed_by,
          performed_at: payload.performed_at || new Date().toISOString(),
        })
        .select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Lead 업데이트 — stage 자동 변경 + 다음 액션 자동 정리
      const leadUpdates: Record<string, unknown> = {}
      if (payload.auto_stage) {
        leadUpdates.stage = payload.auto_stage
        if (payload.auto_stage === '도입직전' || payload.auto_stage === '도입완료') {
          leadUpdates.converted_at = new Date().toISOString()
        }
      }
      // 활동이 기록되면 이 lead 의 "다음 액션" 은 완료된 것으로 간주 → 자동 clear.
      // (사용자 피드백: "다음액션일 지정하고 그 액션 했는데 계속 업무처리 안했다고 나온다")
      // payload.keep_next_action 이 true 면 clear 안함.
      if (!payload.keep_next_action) {
        leadUpdates.next_action = null
        leadUpdates.next_action_date = null
      }
      if (Object.keys(leadUpdates).length > 0) {
        await supabase.from('pipeline_leads').update(leadUpdates).eq('id', lead_id)
      }

      // stage 변경 history
      if (payload.auto_stage && payload.current_stage && payload.current_stage !== payload.auto_stage) {
        await supabase.from('pipeline_history').insert({
          lead_id, field_changed: 'stage',
          old_value: payload.current_stage, new_value: payload.auto_stage,
          changed_by: payload.performed_by,
        })
      }

      return NextResponse.json({ success: true, data })
    }

    // 5. Edit lead (full form save)
    if (action === 'edit_lead') {
      const { data, error } = await supabase.from('pipeline_leads')
        .update(payload.form)
        .eq('id', lead_id)
        .select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, data })
    }

    // 6. Update next action
    if (action === 'update_next_action') {
      const { error } = await supabase.from('pipeline_leads')
        .update({
          next_action: payload.next_action || null,
          next_action_date: payload.next_action_date || null,
        })
        .eq('id', lead_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 7. Link/unlink customer
    if (action === 'link_customer') {
      const { error } = await supabase.from('pipeline_leads')
        .update({ customer_id: payload.customer_id || null })
        .eq('id', lead_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 8. Delete activity
    if (action === 'delete_activity') {
      const { error } = await supabase.from('activity_logs').delete().eq('id', payload.activity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 9. Edit activity
    if (action === 'edit_activity') {
      const { error } = await supabase.from('activity_logs')
        .update({
          activity_type: payload.activity_type,
          title: payload.title,
          description: payload.description || null,
        })
        .eq('id', payload.activity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 10. Create VoC ticket + activity log
    if (action === 'create_voc_ticket') {
      const { data: vocData, error } = await supabase
        .from('voc_tickets')
        .insert({
          customer_id: payload.customer_id,
          category: payload.category,
          channel: payload.channel,
          priority: payload.priority,
          title: payload.title,
          description: payload.description || null,
          reported_by: payload.reported_by || '',
          created_by: payload.created_by,
          assigned_to: payload.assigned_to || null,
        })
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Also log as activity
      if (vocData) {
        await supabase.from('activity_logs').insert({
          lead_id,
          customer_id: payload.customer_id,
          activity_type: 'NOTE',
          title: `VoC 티켓 생성: ${payload.title}`,
          description: `티켓 #${vocData.ticket_number} (${payload.category_label || payload.category})`,
          performed_by: payload.created_by,
        })
      }
      return NextResponse.json({ success: true, data: vocData })
    }

    // 11. Bulk move stage (board view)
    if (action === 'bulk_move_stage') {
      const { lead_ids, new_stage, history_records } = payload
      // Insert history records
      if (history_records && history_records.length > 0) {
        await supabase.from('pipeline_history').insert(history_records)
      }
      const updates: Record<string, unknown> = { stage: new_stage }
      if (new_stage === '도입직전' || new_stage === '도입완료') {
        updates.converted_at = new Date().toISOString()
      }
      const { error } = await supabase.from('pipeline_leads').update(updates).in('id', lead_ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 12. Bulk assign (board view)
    if (action === 'bulk_assign') {
      const { lead_ids, user_id } = payload
      const { error } = await supabase.from('pipeline_leads')
        .update({ assigned_to: user_id })
        .in('id', lead_ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // 13. Bulk delete
    if (action === 'bulk_delete') {
      const { lead_ids } = payload
      // Delete related records first
      await supabase.from('activity_logs').delete().in('lead_id', lead_ids)
      await supabase.from('pipeline_history').delete().in('lead_id', lead_ids)
      const { error } = await supabase.from('pipeline_leads').delete().in('id', lead_ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('[Pipeline Update Error]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
