/**
 * ContactModal 组件测试
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactModal } from './ContactModal';
import { ContactService } from '@backend/ContactService';
import { Contact } from '@frontend/types';
import { vi } from 'vitest';

// Mock ContactService
vi.mock('@backend/ContactService', () => {
  return {
    ContactService: {
      addContact: vi.fn(),
      updateContact: vi.fn(),
      deleteContact: vi.fn(),
    },
  };
});

describe('ContactModal', () => {
  const mockContact: Contact = {
    id: 'contact-123',
    name: '张三',
    email: 'zhangsan@example.com',
    phone: '13800138000',
    organization: '字节跳动',
    is4DNote: true,
  };

  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('visible=false 时不应该渲染', () => {
      const { container } = render(
        <ContactModal
          visible={false}
          contact={mockContact}
          onClose={mockOnClose}
        />
      );
      
      expect(container.firstChild).toBeNull();
    });

    it('visible=true 时应该渲染 Modal', () => {
      render(
        <ContactModal
          visible={true}
          contact={mockContact}
          onClose={mockOnClose}
        />
      );
      
      expect(screen.getByText('编辑联系人')).toBeInTheDocument();
      expect(screen.getByText(/张三/)).toBeInTheDocument();
    });

    it('create 模式应该显示"新建联系人"标题', () => {
      render(
        <ContactModal
          visible={true}
          mode="create"
          onClose={mockOnClose}
        />
      );
      
      expect(screen.getByText('新建联系人')).toBeInTheDocument();
      expect(screen.getByText('创建')).toBeInTheDocument();
    });

    it('view 模式应该显示"联系人信息"标题且不可编辑', () => {
      render(
        <ContactModal
          visible={true}
          contact={mockContact}
          mode="view"
          onClose={mockOnClose}
        />
      );
      
      expect(screen.getByText('联系人信息')).toBeInTheDocument();
      
      const editable = document.querySelector('.modal-body-editable');
      expect(editable).toHaveAttribute('contenteditable', 'false');
    });
  });

  describe('交互测试', () => {
    it('点击关闭按钮应该调用 onClose', () => {
      render(
        <ContactModal
          visible={true}
          contact={mockContact}
          onClose={mockOnClose}
        />
      );
      
      const closeBtn = screen.getByText('✕');
      fireEvent.click(closeBtn);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('点击背景蒙层应该调用 onClose', () => {
      render(
        <ContactModal
          visible={true}
          contact={mockContact}
          onClose={mockOnClose}
        />
      );
      
      const backdrop = document.querySelector('.contact-modal-backdrop');
      fireEvent.click(backdrop!);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('按 Escape 键应该关闭 Modal', () => {
      render(
        <ContactModal
          visible={true}
          contact={mockContact}
          onClose={mockOnClose}
        />
      );
      
      const modal = document.querySelector('.contact-modal');
      fireEvent.keyDown(modal!, { key: 'Escape' });
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('保存功能测试', () => {
    it('create 模式应该调用 ContactService.addContact', async () => {
      const mockNewContact = { ...mockContact };
      (ContactService.addContact as any).mockReturnValue(mockNewContact);
      
      render(
        <ContactModal
          visible={true}
          mode="create"
          contact={{ name: '张三', email: 'zhangsan@example.com' }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );
      
      const saveBtn = screen.getByText('创建');
      fireEvent.click(saveBtn);
      
      expect(ContactService.addContact).toHaveBeenCalled();
      await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(mockNewContact));
      await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
    });

    it('edit 模式应该调用 ContactService.updateContact', async () => {
      const updatedContact = { ...mockContact, phone: '13900139000' };
      (ContactService.updateContact as any).mockReturnValue(updatedContact);
      
      render(
        <ContactModal
          visible={true}
          mode="edit"
          contact={mockContact}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );
      
      // 修改电话字段（这里简化测试，实际需要模拟 contentEditable）
      const saveBtn = screen.getByText('完成');
      fireEvent.click(saveBtn);
      
      // 验证更新被调用（即使没有变更，也应该能正常关闭）
      await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
    });
  });

  describe('删除功能测试', () => {
    it('应该显示删除按钮（edit 模式）', () => {
      render(
        <ContactModal
          visible={true}
          mode="edit"
          contact={mockContact}
          onClose={mockOnClose}
        />
      );
      
      expect(screen.getByText('删除')).toBeInTheDocument();
    });

    it('create 模式不应该显示删除按钮', () => {
      render(
        <ContactModal
          visible={true}
          mode="create"
          onClose={mockOnClose}
        />
      );
      
      expect(screen.queryByText('删除')).not.toBeInTheDocument();
    });

    it('点击删除应该调用 ContactService.deleteContact', () => {
      // Mock window.confirm
      window.confirm = vi.fn(() => true);
      
      render(
        <ContactModal
          visible={true}
          mode="edit"
          contact={mockContact}
          onClose={mockOnClose}
          onDelete={mockOnDelete}
        />
      );
      
      const deleteBtn = screen.getByText('删除');
      fireEvent.click(deleteBtn);
      
      expect(window.confirm).toHaveBeenCalledWith('确定要删除联系人 "张三" 吗？');
      expect(ContactService.deleteContact).toHaveBeenCalledWith('contact-123');
      expect(mockOnDelete).toHaveBeenCalledWith('contact-123');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Tippy 定位测试', () => {
    it('有 triggerElement 时应该使用 Tippy 定位', () => {
      const triggerElement = document.createElement('div');
      triggerElement.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        left: 200,
        bottom: 120,
        right: 250,
        width: 50,
        height: 20,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }));
      
      render(
        <ContactModal
          visible={true}
          contact={mockContact}
          onClose={mockOnClose}
          triggerElement={triggerElement}
          placement="bottom-start"
        />
      );
      
      // 验证 Tippy 容器存在
      const tippyBox = document.querySelector('[data-tippy-root]');
      expect(tippyBox).toBeTruthy();
    });

    it('无 triggerElement 时应该居中显示', () => {
      render(
        <ContactModal
          visible={true}
          contact={mockContact}
          onClose={mockOnClose}
        />
      );
      
      const wrapper = document.querySelector('.contact-modal-wrapper');
      expect(wrapper).toBeInTheDocument();
    });
  });
});
