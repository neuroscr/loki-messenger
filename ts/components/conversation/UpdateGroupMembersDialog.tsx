import React from 'react';
import classNames from 'classnames';
import { Contact, MemberList } from './MemberList';
import { Avatar } from '../Avatar';

import { SessionModal } from '../session/SessionModal';
import { SessionButton } from '../session/SessionButton';

interface Props {
  titleText: string;
  groupName: string;
  groupId: string;
  okText: string;
  isPublic: boolean;
  cancelText: string;
  // friends not in the group
  friendList: Array<any>;
  isAdmin: boolean;
  existingMembers: Array<String>;
  i18n: any;
  onSubmit: any;
  onClose: any;
  // avatar stuff
  avatarPath: string;
}

interface State {
  friendList: Array<Contact>;
  errorDisplayed: boolean;
  errorMessage: string;
  avatar: string;
}

<<<<<<< Updated upstream:ts/components/conversation/UpdateGroupMembersDialog.tsx
export class UpdateGroupMembersDialog extends React.Component<Props, State> {
=======
export class UpdateGroupDialog extends React.Component<Props, State> {
  private readonly inputEl: any;

>>>>>>> Stashed changes:ts/components/conversation/UpdateGroupDialog.tsx
  constructor(props: any) {
    super(props);

    this.onMemberClicked = this.onMemberClicked.bind(this);
    this.onClickOK = this.onClickOK.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.closeDialog = this.closeDialog.bind(this);
    this.onGroupNameChanged = this.onGroupNameChanged.bind(this);
    this.onFileSelected = this.onFileSelected.bind(this);

    let friends = this.props.friendList;
    friends = friends.map(d => {
      const lokiProfile = d.getLokiProfile();
      const name = lokiProfile ? lokiProfile.displayName : 'Anonymous';

      const existingMember = this.props.existingMembers.includes(d.id);

      return {
        id: d.id,
        authorPhoneNumber: d.id,
        authorProfileName: name,
        selected: false,
        authorName: name, // different from ProfileName?
        authorColor: d.getColor(),
        checkmarked: false,
        existingMember,
      };
    });

    this.state = {
      friendList: friends,
      errorDisplayed: false,
      errorMessage: 'placeholder',
      avatar: this.props.avatarPath,
    };
    this.inputEl = React.createRef();

    window.addEventListener('keyup', this.onKeyUp);
  }

  public onClickOK() {
    const members = this.getWouldBeMembers(this.state.friendList).map(
      d => d.id
    );

<<<<<<< Updated upstream:ts/components/conversation/UpdateGroupMembersDialog.tsx
    this.props.onSubmit(this.props.groupName, members);
=======
    if (!this.state.groupName.trim()) {
      this.onShowError(this.props.i18n('emptyGroupNameError'));

      return;
    }

    const avatar =
      this.inputEl &&
      this.inputEl.current &&
      this.inputEl.current.files &&
      this.inputEl.current.files.length > 0
        ? this.inputEl.current.files[0]
        : this.props.avatarPath; // otherwise use the current avatar

    this.props.onSubmit(this.state.groupName, members, avatar);
>>>>>>> Stashed changes:ts/components/conversation/UpdateGroupDialog.tsx

    this.closeDialog();
  }

  private onFileSelected() {
    const file = this.inputEl.current.files[0];
    const url = window.URL.createObjectURL(file);

    this.setState({
      avatar: url,
    });
  }

  private renderAvatar() {
    const avatarPath = this.state.avatar;
    const color = '#00ff00';

    return (
      <Avatar
        avatarPath={avatarPath}
        color={color}
        conversationType="group"
        i18n={this.props.i18n}
        name={this.state.groupName}
        phoneNumber={this.props.groupId}
        profileName={this.state.groupName}
        size={80}
      />
    );
  }

  public render() {
    const checkMarkedCount = this.getMemberCount(this.state.friendList);

    const okText = this.props.okText;
    const cancelText = this.props.cancelText;

    let titleText;
    let noFriendsClasses;
    let noAvatarClasses;

    if (this.props.isPublic) {
      // no member count in title
      titleText = `${this.props.titleText}`;
      // hide the no-friend message
      noFriendsClasses = classNames('no-friends', 'hidden');
      noAvatarClasses = classNames('avatar-center');
    } else {
      // private group
      titleText = `${this.props.titleText} (Members: ${checkMarkedCount})`;
      noFriendsClasses =
        this.state.friendList.length === 0
          ? 'no-friends'
          : classNames('no-friends', 'hidden');
      noAvatarClasses = classNames('hidden');
    }

    const errorMsg = this.state.errorMessage;
    const errorMessageClasses = classNames(
      'error-message',
      this.state.errorDisplayed ? 'error-shown' : 'error-faded'
    );

    return (
      <SessionModal
        title={titleText}
        // tslint:disable-next-line: no-void-expression
        onClose={() => this.closeDialog()}
        onOk={() => null}
      >
        <div className="spacer-md" />
        <p className={errorMessageClasses}>{errorMsg}</p>
        <div className="spacer-md" />

        <div className="friend-selection-list">
          <MemberList
            members={this.state.friendList}
            selected={{}}
            i18n={this.props.i18n}
            onMemberClicked={this.onMemberClicked}
          />
        </div>
        <p className={noFriendsClasses}>{`(${this.props.i18n(
          'noMembersInThisGroup'
        )})`}</p>
<<<<<<< Updated upstream:ts/components/conversation/UpdateGroupMembersDialog.tsx

        <div className="session-modal__button-group">
          <SessionButton text={okText} onClick={this.onClickOK} />

          <SessionButton text={cancelText} onClick={this.closeDialog} />
=======
        <div className={noAvatarClasses}>
          <div className="avatar-center-inner">
            {this.renderAvatar()}
            <div className="upload-btn-background">
              <input
                type="file"
                ref={this.inputEl}
                className="input-file"
                placeholder="input file"
                name="name"
                onChange={this.onFileSelected}
              />
              <div
                role="button"
                className={'module-message__buttons__upload'}
                onClick={() => {
                  const el = this.inputEl.current;
                  if (el) {
                    el.click();
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="buttons">
          <button className="cancel" tabIndex={0} onClick={this.closeDialog}>
            {cancelText}
          </button>
          <button className="ok" tabIndex={0} onClick={this.onClickOK}>
            {okText}
          </button>
>>>>>>> Stashed changes:ts/components/conversation/UpdateGroupDialog.tsx
        </div>
      </SessionModal>
    );
  }

  private onShowError(msg: string) {
    if (this.state.errorDisplayed) {
      return;
    }

    this.setState({
      errorDisplayed: true,
      errorMessage: msg,
    });

    setTimeout(() => {
      this.setState({
        errorDisplayed: false,
      });
    }, 3000);
  }

  private onKeyUp(event: any) {
    switch (event.key) {
      case 'Enter':
        this.onClickOK();
        break;
      case 'Esc':
      case 'Escape':
        this.closeDialog();
        break;
      default:
    }
  }

  // Return members that would comprise the group given the
  // current state in `users`
  private getWouldBeMembers(users: Array<Contact>) {
    return users.filter(d => {
      return (
        (d.existingMember && !d.checkmarked) ||
        (!d.existingMember && d.checkmarked)
      );
    });
  }

  private getMemberCount(users: Array<Contact>) {
    // Adding one to include ourselves
    return this.getWouldBeMembers(users).length + 1;
  }

  private closeDialog() {
    window.removeEventListener('keyup', this.onKeyUp);

    this.props.onClose();
  }

  private onMemberClicked(selected: any) {
    if (selected.existingMember && !this.props.isAdmin) {
      this.onShowError(this.props.i18n('nonAdminDeleteMember'));

      return;
    }

    const updatedFriends = this.state.friendList.map(member => {
      if (member.id === selected.id) {
        return { ...member, checkmarked: !member.checkmarked };
      } else {
        return member;
      }
    });

    this.setState(state => {
      return {
        ...state,
        friendList: updatedFriends,
      };
    });
  }

  private onGroupNameChanged(event: any) {
    event.persist();

    this.setState(state => {
      return {
        ...state,
        groupName: event.target.value,
      };
    });
  }
}
