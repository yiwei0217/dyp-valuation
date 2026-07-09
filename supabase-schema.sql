-- ============================================================
-- 价值投资估值助手 - Supabase 数据库结构
-- 运行方式：Supabase 后台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- ============================================================
-- 1. 创建表
-- ============================================================

-- 邀请码表
create table if not exists public.invite_codes (
    id uuid default gen_random_uuid() primary key,
    code text unique not null,
    is_used boolean default false,
    used_by text,
    used_at timestamptz,
    created_at timestamptz default now()
);

-- 用户表
create table if not exists public.users (
    id uuid default gen_random_uuid() primary key,
    username text unique not null,
    password_hash text not null,
    invite_code text not null,
    created_at timestamptz default now()
);

-- ============================================================
-- 2. 开启行级安全（RLS）
-- ============================================================
alter table public.invite_codes enable row level security;
alter table public.users enable row level security;

-- 默认拒绝所有直接访问，前端通过函数/RPC 间接操作
-- 管理员可以通过 Supabase Table Editor 查看数据

-- ============================================================
-- 3. 创建业务函数（RPC）
-- ============================================================

-- 验证邀请码是否有效
create or replace function public.validate_invite_code(p_code text)
returns boolean
language plpgsql
security definer
as $$
begin
    return exists (
        select 1 from public.invite_codes
        where code = upper(p_code) and is_used = false
    );
end;
$$;

-- 用户注册
-- 成功返回 true，失败返回 false
-- 自动将邀请码标记为已使用
-- 密码在前端用 SHA-256 哈希后传入
create or replace function public.register_user(
    p_username text,
    p_password_hash text,
    p_code text
)
returns boolean
language plpgsql
security definer
as $$
declare
    v_code_exists boolean;
    v_clean_username text;
begin
    v_clean_username := lower(trim(p_username));

    -- 检查邀请码是否存在且未使用
    select exists (
        select 1 from public.invite_codes
        where code = upper(p_code) and is_used = false
    ) into v_code_exists;

    if not v_code_exists then
        return false;
    end if;

    -- 检查用户名是否已存在（包括 admin 保留名）
    if exists (select 1 from public.users where username = v_clean_username) then
        return false;
    end if;

    -- 插入新用户
    insert into public.users (username, password_hash, invite_code)
    values (v_clean_username, p_password_hash, upper(p_code));

    -- 标记邀请码已使用
    update public.invite_codes
    set is_used = true,
        used_by = v_clean_username,
        used_at = now()
    where code = upper(p_code);

    return true;
end;
$$;

-- 用户登录
-- 返回用户信息，找不到则返回空
create or replace function public.login_user(
    p_username text,
    p_password_hash text
)
returns table (
    username text,
    invite_code text,
    created_at timestamptz
)
language plpgsql
security definer
as $$
begin
    return query
    select u.username, u.invite_code, u.created_at
    from public.users u
    where u.username = lower(trim(p_username))
      and u.password_hash = p_password_hash;
end;
$$;

-- ============================================================
-- 4. 管理员函数
-- ============================================================

-- 管理员身份验证
create or replace function public.admin_login(
    p_username text,
    p_password_hash text
)
returns boolean
language plpgsql
security definer
as $$
begin
    return exists (
        select 1 from public.users
        where username = lower(trim(p_username))
          and password_hash = p_password_hash
    );
end;
$$;

-- 获取所有邀请码（管理员）
create or replace function public.get_invite_codes()
returns table (
    id uuid,
    code text,
    is_used boolean,
    used_by text,
    used_at timestamptz,
    created_at timestamptz
)
language plpgsql
security definer
as $$
begin
    return query
    select ic.id, ic.code, ic.is_used, ic.used_by, ic.used_at, ic.created_at
    from public.invite_codes ic
    order by ic.created_at desc;
end;
$$;

-- 创建新邀请码（管理员）
create or replace function public.create_invite_code(p_code text)
returns boolean
language plpgsql
security definer
as $$
begin
    insert into public.invite_codes (code)
    values (upper(trim(p_code)));
    return true;
exception
    when unique_violation then
        return false;
end;
$$;

-- 删除邀请码（管理员）
create or replace function public.delete_invite_code(p_code text)
returns boolean
language plpgsql
security definer
as $$
begin
    delete from public.invite_codes where code = upper(trim(p_code));
    return true;
end;
$$;

-- 获取所有用户（管理员）
create or replace function public.get_users()
returns table (
    username text,
    invite_code text,
    created_at timestamptz
)
language plpgsql
security definer
as $$
begin
    return query
    select u.username, u.invite_code, u.created_at
    from public.users u
    where u.username != 'admin'
    order by u.created_at desc;
end;
$$;

-- 修改管理员密码
create or replace function public.change_admin_password(
    p_old_password_hash text,
    p_new_password_hash text
)
returns boolean
language plpgsql
security definer
as $$
begin
    update public.users
    set password_hash = p_new_password_hash
    where username = 'admin'
      and password_hash = p_old_password_hash;

    return found;
end;
$$;

-- ============================================================
-- 5. 初始化数据
-- ============================================================

-- 插入默认邀请码
insert into public.invite_codes (code) values
('ZS2026'), ('VALUE1'), ('DUANYP'), ('ZJJM66'), ('BUFFET')
on conflict (code) do nothing;

-- 创建管理员账号
-- 默认密码：admin123
-- 密码哈希：SHA-256("admin123")
-- 运行后请务必登录后台修改默认密码！
insert into public.users (username, password_hash, invite_code)
values (
    'admin',
    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
    'SYSTEM'
)
on conflict (username) do nothing;
