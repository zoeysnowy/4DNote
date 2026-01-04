/**
 * ContactService Phase 1.5 测试
 * 测试批量获取、多来源去重、扩展字段解析等功能
 */

import { ContactService } from '@backend/ContactService';
import { Contact } from '@frontend/types';

// 清空 localStorage
beforeEach(async () => {
  localStorage.clear();
  // 重新初始化
  (ContactService as any).initialized = false;
  (ContactService as any).contacts = [];
  await ContactService.initialize();
});

describe('ContactService Phase 1.5 - 批量获取', () => {
  it('应该批量获取多个联系人', async () => {
    // 创建多个联系人
    const contact1 = await ContactService.addContact({ name: '张三', email: 'zhangsan@example.com' });
    const contact2 = await ContactService.addContact({ name: '李四', email: 'lisi@example.com' });
    const contact3 = await ContactService.addContact({ name: '王五', email: 'wangwu@example.com' });
    
    // 批量获取
    const contacts = await ContactService.getContactsByIds([contact1.id!, contact2.id!, contact3.id!]);
    
    expect(contacts.length).toBe(3);
    expect(contacts[0].name).toBe('张三');
    expect(contacts[1].name).toBe('李四');
    expect(contacts[2].name).toBe('王五');
  });

  it('应该保持传入 ID 的顺序', async () => {
    const contact1 = await ContactService.addContact({ name: '张三' } as any);
    const contact2 = await ContactService.addContact({ name: '李四' } as any);
    const contact3 = await ContactService.addContact({ name: '王五' } as any);
    
    // 乱序获取
    const contacts = await ContactService.getContactsByIds([contact3.id!, contact1.id!, contact2.id!]);
    
    expect(contacts[0].name).toBe('王五');
    expect(contacts[1].name).toBe('张三');
    expect(contacts[2].name).toBe('李四');
  });

  it('应该跳过不存在的 ID', async () => {
    const contact1 = await ContactService.addContact({ name: '张三' } as any);
    
    const contacts = await ContactService.getContactsByIds([
      contact1.id!,
      'non-existent-id',
      'another-invalid-id',
    ]);
    
    expect(contacts.length).toBe(1);
    expect(contacts[0].name).toBe('张三');
  });

  it('批量获取性能应该优于多次单独获取', async () => {
    // 创建 100 个联系人
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      const contact = await ContactService.addContact({ name: `联系人${i}` } as any);
      ids.push(contact.id!);
    }
    
    // 测试批量获取性能
    const start1 = performance.now();
    const batchResults = await ContactService.getContactsByIds(ids);
    const time1 = performance.now() - start1;
    
    // 测试单独获取性能
    const start2 = performance.now();
    const individualResults = await Promise.all(ids.map(id => ContactService.getContactById(id)));
    const time2 = performance.now() - start2;
    
    expect(batchResults.length).toBe(100);
    expect(individualResults.length).toBe(100);
    
    // 批量获取应该更快（允许一定误差）
    console.log(`批量获取: ${time1.toFixed(2)}ms, 单独获取: ${time2.toFixed(2)}ms`);
    expect(time1).toBeLessThan(time2 * 1.5);
  });
});

describe('ContactService Phase 1.5 - 多来源去重', () => {
  it('应该根据邮箱去重', () => {
    const contacts: Contact[] = [
      { name: '张三', email: 'zhangsan@example.com', isOutlook: true },
      { name: '张三（本地）', email: 'zhangsan@example.com', is4DNote: true },
      { name: '张三（Google）', email: 'zhangsan@example.com', isGoogle: true },
    ];
    
    const merged = ContactService.mergeContactSources(contacts);
    
    expect(merged.length).toBe(1);
    // 应该保留 Outlook/Google 来源的（优先级高）
    expect(merged[0].isOutlook || merged[0].isGoogle).toBe(true);
  });

  it('应该根据姓名去重（无邮箱时）', () => {
    const contacts: Contact[] = [
      { name: '张三', is4DNote: true },
      { name: '张三', organization: '字节跳动' },
      { name: '张三', phone: '13800138000' },
    ];
    
    const merged = ContactService.mergeContactSources(contacts);
    
    expect(merged.length).toBe(1);
  });

  it('应该按优先级排序：平台 > 本地 > 历史', () => {
    const contacts: Contact[] = [
      { name: '张三', email: 'zhangsan@example.com' }, // 历史参会人（无来源标识）
      { name: '张三', email: 'zhangsan@example.com', is4DNote: true }, // 本地
      { name: '张三', email: 'zhangsan@example.com', isOutlook: true }, // 平台
    ];
    
    const merged = ContactService.mergeContactSources(contacts);
    
    expect(merged.length).toBe(1);
    expect(merged[0].isOutlook).toBe(true); // 应该是 Outlook 来源
  });

  it('应该合并相同优先级的联系人数据', () => {
    const contacts: Contact[] = [
      { name: '张三', email: 'zhangsan@example.com', is4DNote: true },
      { name: '张三', email: 'zhangsan@example.com', is4DNote: true, phone: '13800138000' },
    ];
    
    const merged = ContactService.mergeContactSources(contacts);
    
    expect(merged.length).toBe(1);
    expect(merged[0].phone).toBe('13800138000'); // 应该合并了电话字段
  });

  it('应该跳过无效联系人（无邮箱和姓名）', () => {
    const contacts: Contact[] = [
      { name: '张三', email: 'zhangsan@example.com' },
      { phone: '13800138000' }, // 无名无邮箱
      { organization: '字节跳动' }, // 无名无邮箱
    ];
    
    const merged = ContactService.mergeContactSources(contacts);
    
    expect(merged.length).toBe(1);
    expect(merged[0].name).toBe('张三');
  });
});

describe('ContactService Phase 1.5 - 扩展字段解析', () => {
  it('应该从 notes 中解析职务', async () => {
    const contact = await ContactService.addContact({
      name: '张三',
      notes: '职务：产品经理\n其他备注信息',
    } as any);
    
    const stored = await ContactService.getContactById(contact.id!);
    
    expect(stored?.position).toBe('产品经理');
    expect(stored?.notes).toBe('其他备注信息'); // 职务应该被移除
  });

  it('应该从 notes 中解析标签', async () => {
    const contact = await ContactService.addContact({
      name: '张三',
      notes: '标签：重要客户, VIP, 合作伙伴',
    } as any);
    
    const stored = await ContactService.getContactById(contact.id!);
    
    expect(stored?.tags).toEqual(['重要客户', 'VIP', '合作伙伴']);
  });

  it('应该同时解析职务和标签', async () => {
    const contact = await ContactService.addContact({
      name: '张三',
      notes: '职务：产品经理\n标签：重要客户, VIP\n电话备注：工作时间联系',
    } as any);
    
    const stored = await ContactService.getContactById(contact.id!);
    
    expect(stored?.position).toBe('产品经理');
    expect(stored?.tags).toEqual(['重要客户', 'VIP']);
    expect(stored?.notes).toBe('电话备注：工作时间联系');
  });

  it('更新时应该序列化扩展字段到 notes', async () => {
    const contact = await ContactService.addContact({ name: '张三' } as any);
    
    // 更新扩展字段
    await ContactService.updateContact(contact.id!, {
      position: '产品经理',
      tags: ['重要客户', 'VIP'],
    } as any);
    
    // 读取原始数据（未解析）
    const raw = (ContactService as any).contacts.find((c: Contact) => c.id === contact.id);
    expect(raw.notes).toContain('职务：产品经理');
    expect(raw.notes).toContain('标签：重要客户, VIP');
    
    // 通过 API 读取（已解析）
    const parsed = await ContactService.getContactById(contact.id!);
    expect(parsed?.position).toBe('产品经理');
    expect(parsed?.tags).toEqual(['重要客户', 'VIP']);
  });

  it('应该保留 notes 中的其他内容', async () => {
    const contact = await ContactService.addContact({
      name: '张三',
      notes: '重要备注\n职务：产品经理\n另一条备注',
    } as any);
    
    const stored = await ContactService.getContactById(contact.id!);
    
    expect(stored?.position).toBe('产品经理');
    expect(stored?.notes).toBe('重要备注\n另一条备注');
  });

  it('getAllContacts 应该返回解析后的扩展字段', async () => {
    const created = await ContactService.addContact({
      name: '张三',
      notes: '职务：产品经理\n标签：VIP',
    });
    
    const all = await ContactService.getAllContacts();

    const found = all.find(c => c.id === created.id);
    expect(found?.position).toBe('产品经理');
    expect(found?.tags).toEqual(['VIP']);
  });

  it('搜索方法应该返回解析后的扩展字段', async () => {
    await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@example.com',
      is4DNote: true,
      notes: '职务：产品经理',
    });
    
    const results = ContactService.searchLocalContacts('张三');
    
    expect(results[0].position).toBe('产品经理');
  });
});

describe('ContactService Phase 1.5 - 搜索优化', () => {
  it('searchPlatformContacts 应该返回解析后的扩展字段', async () => {
    await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@outlook.com',
      isOutlook: true,
      notes: '职务：高级工程师',
    });
    
    const results = ContactService.searchPlatformContacts('张三');
    
    expect(results.length).toBe(1);
    expect(results[0].position).toBe('高级工程师');
  });

  it('searchLocalContacts 应该返回解析后的扩展字段', async () => {
    await ContactService.addContact({
      name: '李四',
      is4DNote: true,
      notes: '标签：客户, 潜在合作',
    });
    
    const results = ContactService.searchLocalContacts('李四');
    
    expect(results.length).toBe(1);
    expect(results[0].tags).toEqual(['客户', '潜在合作']);
  });
});
